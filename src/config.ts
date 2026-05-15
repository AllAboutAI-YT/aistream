import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig, SceneSource, SourcesFile } from "./types.js";

function trimmed(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name];
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function intEnv(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const v = trimmed(env, name);
  if (v == null) return def;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || String(n) !== v) {
    throw new Error(`Invalid integer for env ${name}: ${v}`);
  }
  return n;
}

function floatEnv(env: NodeJS.ProcessEnv, name: string, def: number): number {
  const v = trimmed(env, name);
  if (v == null) return def;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number for env ${name}: ${v}`);
  }
  return n;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = trimmed(env, "HOST") ?? "127.0.0.1";
  const port = intEnv(env, "PORT", 7878);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PORT (must be 1..65535): ${port}`);
  }
  const obsUrl = trimmed(env, "OBS_WEBSOCKET_URL") ?? "ws://127.0.0.1:4455";
  const obsPassword = trimmed(env, "OBS_WEBSOCKET_PASSWORD");
  const agentMinConfidence = floatEnv(env, "AGENT_MIN_CONFIDENCE", 0.7);
  if (agentMinConfidence < 0 || agentMinConfidence > 1) {
    throw new Error(`AGENT_MIN_CONFIDENCE must be in [0,1]: ${agentMinConfidence}`);
  }
  const decisionLogSize = intEnv(env, "DECISION_LOG_SIZE", 100);
  if (decisionLogSize < 1) {
    throw new Error(`DECISION_LOG_SIZE must be >= 1: ${decisionLogSize}`);
  }
  const sourcesFile = trimmed(env, "SOURCES_FILE") ?? "sources.json";
  return { host, port, obsUrl, obsPassword, agentMinConfidence, decisionLogSize, sourcesFile };
}

export function loadSources(path: string): SceneSource[] {
  const absolute = resolve(process.cwd(), path);
  let raw: string;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read sources file at ${absolute}: ${msg}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Sources file ${absolute} is not valid JSON: ${msg}`);
  }
  return validateSources(parsed);
}

export function validateSources(input: unknown): SceneSource[] {
  if (input == null || typeof input !== "object") {
    throw new Error("sources file must be a JSON object");
  }
  const obj = input as Partial<SourcesFile>;
  if (!Array.isArray(obj.sources)) {
    throw new Error("sources file missing 'sources' array");
  }
  const seen = new Set<string>();
  const out: SceneSource[] = [];
  for (let i = 0; i < obj.sources.length; i++) {
    const raw = obj.sources[i];
    if (raw == null || typeof raw !== "object") {
      throw new Error(`sources[${i}] must be an object`);
    }
    const src = raw as Partial<SceneSource>;
    if (typeof src.id !== "string" || src.id.length === 0) {
      throw new Error(`sources[${i}].id must be a non-empty string`);
    }
    if (typeof src.obsScene !== "string" || src.obsScene.length === 0) {
      throw new Error(`sources[${i}].obsScene must be a non-empty string`);
    }
    if (typeof src.label !== "string" || src.label.length === 0) {
      throw new Error(`sources[${i}].label must be a non-empty string`);
    }
    if (seen.has(src.id)) {
      throw new Error(`Duplicate source id: ${src.id}`);
    }
    seen.add(src.id);
    const chatCommands = checkStringArray(src.chatCommands, `sources[${i}].chatCommands`);
    const voicePhrases = checkStringArray(src.voicePhrases, `sources[${i}].voicePhrases`);
    const source: SceneSource = { id: src.id, obsScene: src.obsScene, label: src.label };
    if (chatCommands != null) source.chatCommands = chatCommands;
    if (voicePhrases != null) source.voicePhrases = voicePhrases;
    out.push(source);
  }
  return out;
}

function checkStringArray(value: unknown, label: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return [...value];
}
