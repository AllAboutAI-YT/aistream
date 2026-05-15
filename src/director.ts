import type {
  Decision,
  ObsClient,
  SceneSource,
  SourceHealth,
  Status,
  SwitchRequest,
} from "./types.js";
import { DecisionLog } from "./decisions.js";
import { nowIso } from "./util.js";

export interface DirectorOptions {
  sources: SceneSource[];
  obs: ObsClient;
  log: DecisionLog;
  agentMinConfidence: number;
}

export interface StreamResult {
  ok: boolean;
  error?: string;
}

export class Director {
  private readonly sourceList: SceneSource[];
  private readonly sourceById: Map<string, SceneSource>;
  private readonly obs: ObsClient;
  private readonly log: DecisionLog;
  private readonly agentMinConfidence: number;
  private knownScenes: Set<string> = new Set();

  constructor(opts: DirectorOptions) {
    this.sourceList = [...opts.sources];
    this.sourceById = new Map(this.sourceList.map((s) => [s.id, s]));
    this.obs = opts.obs;
    this.log = opts.log;
    this.agentMinConfidence = opts.agentMinConfidence;
  }

  sources(): SceneSource[] {
    return [...this.sourceList];
  }

  setKnownScenes(names: string[]): void {
    this.knownScenes = new Set(names);
  }

  status(): Status {
    const obsState = this.obs.state();
    const sources: SourceHealth[] = this.sourceList.map((s) => ({
      id: s.id,
      label: s.label,
      obsScene: s.obsScene,
      knownToObs: this.knownScenes.has(s.obsScene),
    }));
    return {
      obs: obsState,
      sources,
      decisions: this.log.recent(),
    };
  }

  async switchSource(req: SwitchRequest): Promise<Decision> {
    if (req.origin === "agent") {
      const c = req.confidence;
      if (c == null || !Number.isFinite(c) || c < this.agentMinConfidence) {
        return this.record(req, "rejected", "below_confidence_threshold");
      }
    }
    const source = this.sourceById.get(req.sourceId);
    if (source == null) {
      return this.record(req, "rejected", "unknown_source");
    }
    if (!this.obs.state().connected) {
      return this.record(req, "rejected", "obs_offline");
    }
    try {
      await this.obs.switchScene(source.obsScene);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.record(req, "rejected", `obs_error:${msg}`);
    }
    return this.record(req, "accepted");
  }

  async startStream(): Promise<StreamResult> {
    if (!this.obs.state().connected) return { ok: false, error: "obs_offline" };
    try {
      await this.obs.startStream();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async stopStream(): Promise<StreamResult> {
    if (!this.obs.state().connected) return { ok: false, error: "obs_offline" };
    try {
      await this.obs.stopStream();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private record(
    req: SwitchRequest,
    outcome: "accepted" | "rejected",
    rejectReason?: string,
  ): Decision {
    const d: Decision = {
      ts: nowIso(),
      sourceId: req.sourceId,
      origin: req.origin,
      reason: req.reason,
      outcome,
    };
    if (rejectReason != null) d.rejectReason = rejectReason;
    this.log.push(d);
    return d;
  }
}
