import type { Decision } from "./types.js";

export class DecisionLog {
  private readonly buf: Decision[] = [];

  constructor(private readonly cap: number) {
    if (!Number.isInteger(cap) || cap < 1) {
      throw new Error(`DecisionLog cap must be a positive integer, got ${cap}`);
    }
  }

  push(d: Decision): void {
    this.buf.push(d);
    if (this.buf.length > this.cap) {
      this.buf.shift();
    }
  }

  recent(): Decision[] {
    return [...this.buf].reverse();
  }

  size(): number {
    return this.buf.length;
  }
}
