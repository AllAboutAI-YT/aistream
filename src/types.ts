export type SourceId = string;

export type SwitchOrigin = "ui" | "api" | "chat" | "voice" | "agent";

export type SwitchOutcome = "accepted" | "rejected";

export interface SceneSource {
  id: SourceId;
  obsScene: string;
  label: string;
  chatCommands?: string[];
  voicePhrases?: string[];
}

export interface SourcesFile {
  sources: SceneSource[];
}

export interface AppConfig {
  host: string;
  port: number;
  obsUrl: string;
  obsPassword: string | undefined;
  agentMinConfidence: number;
  decisionLogSize: number;
  sourcesFile: string;
}

export interface SwitchRequest {
  sourceId: SourceId;
  origin: SwitchOrigin;
  reason: string;
  confidence?: number;
}

export interface Decision {
  ts: string;
  sourceId: SourceId;
  origin: SwitchOrigin;
  reason: string;
  outcome: SwitchOutcome;
  rejectReason?: string;
}

export interface ObsState {
  connected: boolean;
  currentScene: string | null;
  streaming: boolean;
}

export interface SourceHealth {
  id: SourceId;
  label: string;
  obsScene: string;
  knownToObs: boolean;
}

export interface Status {
  obs: ObsState;
  sources: SourceHealth[];
  decisions: Decision[];
}

export interface ObsClient {
  state(): ObsState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listScenes(): Promise<string[]>;
  switchScene(sceneName: string): Promise<void>;
  startStream(): Promise<void>;
  stopStream(): Promise<void>;
}
