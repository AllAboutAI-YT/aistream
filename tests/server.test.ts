import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/server.js";
import { Director } from "../src/director.js";
import { DecisionLog } from "../src/decisions.js";
import { FakeObs } from "./fakes.js";

interface Harness {
  server: Server;
  port: number;
  obs: FakeObs;
  director: Director;
}

async function startApp(): Promise<Harness> {
  const obs = new FakeObs();
  obs.setOnline(["DGX", "MacBook"]);
  const director = new Director({
    sources: [
      { id: "dgx", obsScene: "DGX", label: "DGX" },
      { id: "mb", obsScene: "MacBook", label: "MacBook" },
    ],
    obs,
    log: new DecisionLog(10),
    agentMinConfidence: 0.8,
  });
  director.setKnownScenes(["DGX", "MacBook"]);
  const server = createApp({ director });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  return { server, port, obs, director };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((r) => server.close(() => r()));
}

interface Resp {
  status: number;
  body: any;
}

async function req(port: number, method: string, path: string, body?: unknown): Promise<Resp> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : null };
}

test("GET /sources returns sources", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "GET", "/sources");
    assert.equal(r.status, 200);
    assert.equal(r.body.sources.length, 2);
    assert.equal(r.body.sources[0].id, "dgx");
  } finally {
    await close(server);
  }
});

test("GET /status returns OBS state and decision log", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "GET", "/status");
    assert.equal(r.status, 200);
    assert.equal(r.body.obs.connected, true);
    assert.equal(r.body.decisions.length, 0);
  } finally {
    await close(server);
  }
});

test("GET /healthz returns ok", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "GET", "/healthz");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  } finally {
    await close(server);
  }
});

test("POST /switch happy path returns 200 and triggers OBS", async () => {
  const { server, port, obs } = await startApp();
  try {
    const r = await req(port, "POST", "/switch", { sourceId: "dgx", reason: "ui_click" });
    assert.equal(r.status, 200);
    assert.equal(r.body.decision.outcome, "accepted");
    assert.deepEqual(obs.switchCalls, ["DGX"]);
  } finally {
    await close(server);
  }
});

test("POST /switch unknown source returns 409 rejected", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "POST", "/switch", { sourceId: "ghost" });
    assert.equal(r.status, 409);
    assert.equal(r.body.decision.rejectReason, "unknown_source");
  } finally {
    await close(server);
  }
});

test("POST /switch missing sourceId returns 400", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "POST", "/switch", {});
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test("POST /switch with chat origin is rejected as invalid", async () => {
  const { server, port } = await startApp();
  try {
    // chat origin is not allowed on the generic /switch endpoint
    // (chat goes through Phase 3 listener which calls director directly).
    const r = await req(port, "POST", "/switch", { sourceId: "dgx", origin: "chat" });
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test("POST /agent-decision below threshold returns 409", async () => {
  const { server, port, obs } = await startApp();
  try {
    const r = await req(port, "POST", "/agent-decision", { sourceId: "dgx", confidence: 0.3 });
    assert.equal(r.status, 409);
    assert.equal(r.body.decision.rejectReason, "below_confidence_threshold");
    assert.equal(obs.switchCalls.length, 0);
  } finally {
    await close(server);
  }
});

test("POST /agent-decision missing confidence returns 400", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "POST", "/agent-decision", { sourceId: "dgx" });
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test("POST /agent-decision happy path accepts", async () => {
  const { server, port, obs } = await startApp();
  try {
    const r = await req(port, "POST", "/agent-decision", {
      sourceId: "mb",
      confidence: 0.95,
      reason: "auto",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.decision.outcome, "accepted");
    assert.deepEqual(obs.switchCalls, ["MacBook"]);
  } finally {
    await close(server);
  }
});

test("POST /stream/start then /stop", async () => {
  const { server, port, obs } = await startApp();
  try {
    let r = await req(port, "POST", "/stream/start");
    assert.equal(r.status, 200);
    assert.equal(obs.state().streaming, true);
    r = await req(port, "POST", "/stream/stop");
    assert.equal(r.status, 200);
    assert.equal(obs.state().streaming, false);
  } finally {
    await close(server);
  }
});

test("malformed JSON returns 400", async () => {
  const { server, port } = await startApp();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/switch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid",
    });
    assert.equal(res.status, 400);
  } finally {
    await close(server);
  }
});

test("array body is rejected as 400", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "POST", "/switch", [1, 2, 3]);
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test("unknown route returns 404", async () => {
  const { server, port } = await startApp();
  try {
    const r = await req(port, "GET", "/nope");
    assert.equal(r.status, 404);
  } finally {
    await close(server);
  }
});
