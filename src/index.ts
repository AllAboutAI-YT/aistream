import process from "node:process";
import { loadAppConfig, loadSources } from "./config.js";
import { createObsClient } from "./obs.js";
import { DecisionLog } from "./decisions.js";
import { Director } from "./director.js";
import { createApp } from "./server.js";

async function main(): Promise<void> {
  const cfg = loadAppConfig();
  const sources = loadSources(cfg.sourcesFile);
  console.log(`[director] loaded ${sources.length} sources from ${cfg.sourcesFile}`);

  const obs = createObsClient({
    url: cfg.obsUrl,
    password: cfg.obsPassword,
    logger: (m) => console.log(m),
  });
  const log = new DecisionLog(cfg.decisionLogSize);
  const director = new Director({
    sources,
    obs,
    log,
    agentMinConfidence: cfg.agentMinConfidence,
  });

  try {
    await obs.connect();
    const scenes = await obs.listScenes();
    director.setKnownScenes(scenes);
    console.log(`[director] OBS connected; ${scenes.length} scene(s) discovered`);
    warnMissingScenes(sources, scenes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[director] OBS connection failed: ${msg} (will retry in background)`);
  }

  const server = createApp({ director });
  server.listen(cfg.port, cfg.host, () => {
    console.log(`[director] HTTP API listening on http://${cfg.host}:${cfg.port}`);
  });

  let shuttingDown = false;
  const shutdown = (sig: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[director] ${sig} received, shutting down`);
    server.close();
    void obs.disconnect().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function warnMissingScenes(sources: { id: string; obsScene: string }[], known: string[]): void {
  const set = new Set(known);
  const missing = sources.filter((s) => !set.has(s.obsScene));
  if (missing.length > 0) {
    console.warn(
      `[director] WARNING: ${missing.length} configured source(s) reference OBS scenes that don't exist: ${missing
        .map((s) => `${s.id}->${s.obsScene}`)
        .join(", ")}`,
    );
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`[director] fatal: ${msg}`);
  process.exit(1);
});
