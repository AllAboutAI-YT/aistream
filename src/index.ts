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
  server.on("error", (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[director] HTTP server error: ${msg}`);
    process.exit(1);
  });
  server.listen(cfg.port, cfg.host, () => {
    console.log(`[director] HTTP API listening on http://${cfg.host}:${cfg.port}`);
  });

  let shuttingDown = false;
  const shutdown = async (sig: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[director] ${sig} received, shutting down`);
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[director] server.close failed: ${msg}`);
    }
    try {
      await obs.disconnect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[director] obs.disconnect failed: ${msg}`);
    }
    process.exit(0);
  };
  const onSignal = (sig: string): void => {
    shutdown(sig).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[director] shutdown error: ${msg}`);
      process.exit(1);
    });
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
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
