import { test } from "node:test";
import assert from "node:assert/strict";
import { DecisionLog } from "../src/decisions.js";
import type { Decision } from "../src/types.js";

function mk(id: string): Decision {
  return {
    ts: new Date().toISOString(),
    sourceId: id,
    origin: "api",
    reason: "t",
    outcome: "accepted",
  };
}

test("ring buffer caps at size and returns newest-first", () => {
  const log = new DecisionLog(3);
  log.push(mk("1"));
  log.push(mk("2"));
  log.push(mk("3"));
  log.push(mk("4"));
  const recent = log.recent();
  assert.equal(recent.length, 3);
  assert.equal(recent[0]?.sourceId, "4");
  assert.equal(recent[1]?.sourceId, "3");
  assert.equal(recent[2]?.sourceId, "2");
});

test("size reflects current count", () => {
  const log = new DecisionLog(5);
  assert.equal(log.size(), 0);
  log.push(mk("a"));
  assert.equal(log.size(), 1);
});

test("recent() returns a snapshot (mutating it does not affect log)", () => {
  const log = new DecisionLog(5);
  log.push(mk("a"));
  const recent = log.recent();
  recent.pop();
  assert.equal(log.size(), 1);
});

test("rejects non-positive or non-integer cap", () => {
  assert.throws(() => new DecisionLog(0));
  assert.throws(() => new DecisionLog(-1));
  assert.throws(() => new DecisionLog(1.5));
});
