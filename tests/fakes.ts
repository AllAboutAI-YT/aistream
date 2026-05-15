import type { ObsClient, ObsState } from "../src/types.js";

export class FakeObs implements ObsClient {
  private connected = false;
  private currentScene: string | null = null;
  private streaming = false;
  scenes: string[] = [];
  switchCalls: string[] = [];
  shouldFailSwitch = false;

  state(): ObsState {
    return {
      connected: this.connected,
      currentScene: this.currentScene,
      streaming: this.streaming,
    };
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  setOnline(scenes: string[] = []): void {
    this.connected = true;
    this.scenes = [...scenes];
    if (this.currentScene == null && scenes.length > 0) {
      this.currentScene = scenes[0] ?? null;
    }
  }

  setOffline(): void {
    this.connected = false;
    this.currentScene = null;
    this.streaming = false;
  }

  async listScenes(): Promise<string[]> {
    return [...this.scenes];
  }

  async switchScene(name: string): Promise<void> {
    if (this.shouldFailSwitch) throw new Error("switch_failed");
    this.switchCalls.push(name);
    this.currentScene = name;
  }

  async startStream(): Promise<void> {
    this.streaming = true;
  }

  async stopStream(): Promise<void> {
    this.streaming = false;
  }
}
