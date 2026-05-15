import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppConfig, validateSources } from "../src/config.js";

test("loadAppConfig uses defaults when env is empty", () => {
  const cfg = loadAppConfig({});
  assert.equal(cfg.host, "127.0.0.1");
  assert.equal(cfg.port, 7878);
  assert.equal(cfg.obsUrl, "ws://127.0.0.1:4455");
  assert.equal(cfg.obsPassword, undefined);
  assert.equal(cfg.agentMinConfidence, 0.7);
  assert.equal(cfg.decisionLogSize, 100);
  assert.equal(cfg.sourcesFile, "sources.json");
});

test("loadAppConfig respects overrides", () => {
  const cfg = loadAppConfig({
    HOST: "0.0.0.0",
    PORT: "9000",
    OBS_WEBSOCKET_URL: "ws://obs.local:4455",
    OBS_WEBSOCKET_PASSWORD: "secret",
    AGENT_MIN_CONFIDENCE: "0.9",
    DECISION_LOG_SIZE: "50",
    SOURCES_FILE: "custom.json",
  });
  assert.equal(cfg.host, "0.0.0.0");
  assert.equal(cfg.port, 9000);
  assert.equal(cfg.obsUrl, "ws://obs.local:4455");
  assert.equal(cfg.obsPassword, "secret");
  assert.equal(cfg.agentMinConfidence, 0.9);
  assert.equal(cfg.decisionLogSize, 50);
  assert.equal(cfg.sourcesFile, "custom.json");
});

test("loadAppConfig trims whitespace and treats blank as default", () => {
  const cfg = loadAppConfig({ HOST: "   ", OBS_WEBSOCKET_PASSWORD: "  " });
  assert.equal(cfg.host, "127.0.0.1");
  assert.equal(cfg.obsPassword, undefined);
});

test("loadAppConfig rejects invalid PORT", () => {
  assert.throws(() => loadAppConfig({ PORT: "0" }));
  assert.throws(() => loadAppConfig({ PORT: "99999" }));
  assert.throws(() => loadAppConfig({ PORT: "abc" }));
  assert.throws(() => loadAppConfig({ PORT: "12.5" }));
});

test("loadAppConfig rejects AGENT_MIN_CONFIDENCE outside [0,1]", () => {
  assert.throws(() => loadAppConfig({ AGENT_MIN_CONFIDENCE: "1.5" }));
  assert.throws(() => loadAppConfig({ AGENT_MIN_CONFIDENCE: "-0.1" }));
  assert.throws(() => loadAppConfig({ AGENT_MIN_CONFIDENCE: "nope" }));
});

test("loadAppConfig rejects partial-numeric env values (Number, not parseFloat)", () => {
  assert.throws(() => loadAppConfig({ AGENT_MIN_CONFIDENCE: "0.7abc" }));
});

test("loadAppConfig rejects DECISION_LOG_SIZE < 1", () => {
  assert.throws(() => loadAppConfig({ DECISION_LOG_SIZE: "0" }));
});

test("validateSources accepts valid input and strips unknown fields", () => {
  const sources = validateSources({
    sources: [
      {
        id: "dgx",
        obsScene: "DGX",
        label: "DGX cam",
        chatCommands: ["!dgx"],
        voicePhrases: ["dgx", "show dgx"],
      },
    ],
  });
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.id, "dgx");
  assert.deepEqual(sources[0]?.chatCommands, ["!dgx"]);
  assert.deepEqual(sources[0]?.voicePhrases, ["dgx", "show dgx"]);
});

test("validateSources rejects duplicate ids", () => {
  assert.throws(
    () =>
      validateSources({
        sources: [
          { id: "a", obsScene: "A", label: "A" },
          { id: "a", obsScene: "B", label: "B" },
        ],
      }),
    /Duplicate/,
  );
});

test("validateSources requires non-empty id, obsScene, label", () => {
  assert.throws(() => validateSources({ sources: [{ id: "", obsScene: "x", label: "y" }] }));
  assert.throws(() => validateSources({ sources: [{ id: "x", obsScene: "", label: "y" }] }));
  assert.throws(() => validateSources({ sources: [{ id: "x", obsScene: "y", label: "" }] }));
});

test("validateSources rejects whitespace-only id, obsScene, label", () => {
  assert.throws(() => validateSources({ sources: [{ id: "   ", obsScene: "x", label: "y" }] }));
  assert.throws(() => validateSources({ sources: [{ id: "x", obsScene: "  ", label: "y" }] }));
  assert.throws(() => validateSources({ sources: [{ id: "x", obsScene: "y", label: "\t" }] }));
});

test("validateSources rejects empty/whitespace chatCommands or voicePhrases entries", () => {
  assert.throws(() =>
    validateSources({
      sources: [{ id: "a", obsScene: "A", label: "A", chatCommands: ["!ok", ""] }],
    }),
  );
  assert.throws(() =>
    validateSources({
      sources: [{ id: "a", obsScene: "A", label: "A", voicePhrases: ["ok", "  "] }],
    }),
  );
});

test("validateSources rejects bad chatCommands/voicePhrases types", () => {
  assert.throws(() =>
    validateSources({
      sources: [{ id: "a", obsScene: "A", label: "A", chatCommands: [1, 2] }],
    }),
  );
  assert.throws(() =>
    validateSources({
      sources: [{ id: "a", obsScene: "A", label: "A", voicePhrases: "not an array" }],
    }),
  );
});

test("validateSources rejects non-object input", () => {
  assert.throws(() => validateSources(null));
  assert.throws(() => validateSources("string"));
  assert.throws(() => validateSources({}));
  assert.throws(() => validateSources({ sources: "no" }));
});
