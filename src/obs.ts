import OBSWebSocket, { type OBSResponseTypes } from "obs-websocket-js";
import type { ObsClient, ObsState } from "./types.js";

export interface ObsClientOptions {
  url: string;
  password?: string | undefined;
  reconnectDelayMs?: number;
  logger?: (msg: string) => void;
}

const DEFAULT_RECONNECT_MS = 5000;

export function createObsClient(opts: ObsClientOptions): ObsClient {
  const obs = new OBSWebSocket();
  const log = opts.logger ?? (() => {});
  const reconnectMs = opts.reconnectDelayMs ?? DEFAULT_RECONNECT_MS;

  let connected = false;
  let currentScene: string | null = null;
  let streaming = false;
  let stopped = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  obs.on("ConnectionOpened", () => {
    connected = true;
    log("[obs] connection opened");
  });
  obs.on("ConnectionClosed", () => {
    if (connected) log("[obs] connection closed");
    connected = false;
    currentScene = null;
    streaming = false;
    if (!stopped) scheduleReconnect();
  });
  obs.on("CurrentProgramSceneChanged", (data) => {
    currentScene = data.sceneName;
  });
  obs.on("StreamStateChanged", (data) => {
    streaming = data.outputActive;
  });

  async function attemptConnect(): Promise<void> {
    await obs.connect(opts.url, opts.password);
    try {
      const cur = await obs.call("GetCurrentProgramScene");
      currentScene = cur.currentProgramSceneName;
    } catch (err) {
      currentScene = null;
      const msg = err instanceof Error ? err.message : String(err);
      log(`[obs] GetCurrentProgramScene failed after connect: ${msg}`);
    }
    try {
      const ss = await obs.call("GetStreamStatus");
      streaming = ss.outputActive;
    } catch {
      streaming = false;
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer != null || stopped) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      attemptConnect().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[obs] reconnect failed: ${msg}`);
        scheduleReconnect();
      });
    }, reconnectMs);
    reconnectTimer.unref?.();
  }

  return {
    state(): ObsState {
      return { connected, currentScene, streaming };
    },
    async connect(): Promise<void> {
      stopped = false;
      try {
        await attemptConnect();
      } catch (err) {
        scheduleReconnect();
        throw err;
      }
    },
    async disconnect(): Promise<void> {
      stopped = true;
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        await obs.disconnect();
      } catch {
        // best-effort
      }
    },
    async listScenes(): Promise<string[]> {
      if (!connected) throw new Error("OBS not connected");
      const res: OBSResponseTypes["GetSceneList"] = await obs.call("GetSceneList");
      // OBSResponseTypes types `sceneName` as JsonValue; keep only real, non-empty strings.
      return res.scenes
        .map((s) => s.sceneName)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
    },
    async switchScene(sceneName: string): Promise<void> {
      if (!connected) throw new Error("OBS not connected");
      await obs.call("SetCurrentProgramScene", { sceneName });
      currentScene = sceneName;
    },
    async startStream(): Promise<void> {
      if (!connected) throw new Error("OBS not connected");
      await obs.call("StartStream");
    },
    async stopStream(): Promise<void> {
      if (!connected) throw new Error("OBS not connected");
      await obs.call("StopStream");
    },
  };
}
