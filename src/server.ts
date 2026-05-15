import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Director } from "./director.js";
import type { SwitchOrigin } from "./types.js";
import { HttpError } from "./util.js";

const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_ORIGINS: readonly SwitchOrigin[] = ["ui", "api", "voice", "agent", "chat"];

export interface AppDeps {
  director: Director;
}

export function createApp(deps: AppDeps): Server {
  const { director } = deps;

  const server = createServer((req, res) => {
    void handle(req, res, director).catch((err: unknown) => {
      // Should not happen — handle catches internally — but be safe.
      const msg = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: "internal_error", message: msg });
    });
  });

  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, director: Director): Promise<void> {
  try {
    await route(req, res, director);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: "internal_error", message: msg });
  }
}

async function route(req: IncomingMessage, res: ServerResponse, director: Director): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (method === "GET" && path === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (method === "GET" && path === "/sources") {
    sendJson(res, 200, { sources: director.sources() });
    return;
  }
  if (method === "GET" && path === "/status") {
    sendJson(res, 200, director.status());
    return;
  }
  if (method === "POST" && path === "/switch") {
    const body = await readJsonBody(req);
    const sourceId = requireString(body, "sourceId");
    const reason = optionalString(body, "reason") ?? "manual";
    const origin = parseOrigin(optionalString(body, "origin"), "api", ["ui", "api", "voice"]);
    const decision = await director.switchSource({ sourceId, origin, reason });
    sendJson(res, decision.outcome === "accepted" ? 200 : 409, { decision });
    return;
  }
  if (method === "POST" && path === "/agent-decision") {
    const body = await readJsonBody(req);
    const sourceId = requireString(body, "sourceId");
    const confidence = requireNumber(body, "confidence");
    const reason = optionalString(body, "reason") ?? "agent";
    const decision = await director.switchSource({
      sourceId,
      origin: "agent",
      reason,
      confidence,
    });
    sendJson(res, decision.outcome === "accepted" ? 200 : 409, { decision });
    return;
  }
  if (method === "POST" && path === "/stream/start") {
    const result = await director.startStream();
    sendJson(res, result.ok ? 200 : 409, result);
    return;
  }
  if (method === "POST" && path === "/stream/stop") {
    const result = await director.stopStream();
    sendJson(res, result.ok ? 200 : 409, result);
    return;
  }
  sendJson(res, 404, { error: "not_found" });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload).toString(),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text.length === 0) {
        resolve({});
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        reject(new HttpError(400, "invalid_json"));
        return;
      }
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        reject(new HttpError(400, "body_must_be_object"));
        return;
      }
      resolve(parsed as Record<string, unknown>);
    });
    req.on("error", (err) => reject(err));
  });
}

function requireString(body: Record<string, unknown>, name: string): string {
  const v = body[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new HttpError(400, `missing_or_invalid_field:${name}`);
  }
  return v;
}

function requireNumber(body: Record<string, unknown>, name: string): number {
  const v = body[name];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new HttpError(400, `missing_or_invalid_field:${name}`);
  }
  return v;
}

function optionalString(body: Record<string, unknown>, name: string): string | undefined {
  const v = body[name];
  if (v == null) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `invalid_field:${name}`);
  return v;
}

function parseOrigin(
  raw: string | undefined,
  fallback: SwitchOrigin,
  allowed: readonly SwitchOrigin[],
): SwitchOrigin {
  if (raw == null) return fallback;
  if (!isSwitchOrigin(raw) || !allowed.includes(raw)) {
    throw new HttpError(400, `invalid_origin:${raw}`);
  }
  return raw;
}

function isSwitchOrigin(v: string): v is SwitchOrigin {
  return (ALLOWED_ORIGINS as readonly string[]).includes(v);
}
