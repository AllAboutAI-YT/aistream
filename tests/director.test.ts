import { test } from "node:test";
import assert from "node:assert/strict";
import { Director } from "../src/director.js";
import { DecisionLog } from "../src/decisions.js";
import { FakeObs } from "./fakes.js";

function setup(): { obs: FakeObs; log: DecisionLog; director: Director } {
  const obs = new FakeObs();
  const log = new DecisionLog(10);
  const director = new Director({
    sources: [
      { id: "dgx", obsScene: "DGX", label: "DGX" },
      { id: "mb", obsScene: "MacBook", label: "MacBook" },
    ],
    obs,
    log,
    agentMinConfidence: 0.8,
  });
  return { obs, log, director };
}

test("unknown source is rejected without OBS call", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX", "MacBook"]);
  const d = await director.switchSource({ sourceId: "ghost", origin: "ui", reason: "" });
  assert.equal(d.outcome, "rejected");
  assert.equal(d.rejectReason, "unknown_source");
  assert.equal(obs.switchCalls.length, 0);
});

test("OBS offline yields rejection with obs_offline", async () => {
  const { obs, director } = setup();
  obs.setOffline();
  const d = await director.switchSource({ sourceId: "dgx", origin: "ui", reason: "" });
  assert.equal(d.outcome, "rejected");
  assert.equal(d.rejectReason, "obs_offline");
  assert.equal(obs.switchCalls.length, 0);
});

test("happy path switches scene and accepts", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX", "MacBook"]);
  const d = await director.switchSource({ sourceId: "mb", origin: "ui", reason: "click" });
  assert.equal(d.outcome, "accepted");
  assert.deepEqual(obs.switchCalls, ["MacBook"]);
});

test("agent decision below threshold is rejected without OBS call", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]);
  const d = await director.switchSource({
    sourceId: "dgx",
    origin: "agent",
    reason: "",
    confidence: 0.5,
  });
  assert.equal(d.outcome, "rejected");
  assert.equal(d.rejectReason, "below_confidence_threshold");
  assert.equal(obs.switchCalls.length, 0);
});

test("agent decision missing confidence is rejected", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]);
  const d = await director.switchSource({ sourceId: "dgx", origin: "agent", reason: "" });
  assert.equal(d.outcome, "rejected");
  assert.equal(d.rejectReason, "below_confidence_threshold");
});

test("agent decision at/above threshold is accepted", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]);
  const d = await director.switchSource({
    sourceId: "dgx",
    origin: "agent",
    reason: "",
    confidence: 0.8,
  });
  assert.equal(d.outcome, "accepted");
});

test("OBS error during switch is recorded as rejection with obs_error prefix", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]);
  obs.shouldFailSwitch = true;
  const d = await director.switchSource({ sourceId: "dgx", origin: "ui", reason: "" });
  assert.equal(d.outcome, "rejected");
  assert.match(d.rejectReason ?? "", /^obs_error:/);
});

test("status surfaces decisions newest-first and source health", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]); // MacBook scene missing in OBS
  director.setKnownScenes(await obs.listScenes());
  await director.switchSource({ sourceId: "dgx", origin: "ui", reason: "" });
  const status = director.status();
  assert.equal(status.obs.connected, true);
  assert.equal(status.sources.find((s) => s.id === "dgx")?.knownToObs, true);
  assert.equal(status.sources.find((s) => s.id === "mb")?.knownToObs, false);
  assert.equal(status.decisions[0]?.sourceId, "dgx");
});

test("startStream/stopStream reject when OBS offline", async () => {
  const { director } = setup();
  const a = await director.startStream();
  assert.equal(a.ok, false);
  assert.equal(a.error, "obs_offline");
  const b = await director.stopStream();
  assert.equal(b.ok, false);
  assert.equal(b.error, "obs_offline");
});

test("startStream succeeds when OBS connected", async () => {
  const { obs, director } = setup();
  obs.setOnline(["DGX"]);
  const r = await director.startStream();
  assert.equal(r.ok, true);
  assert.equal(obs.state().streaming, true);
});
