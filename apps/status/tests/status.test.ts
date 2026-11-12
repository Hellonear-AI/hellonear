import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, incidents, pct } from "../lib/status";
import { fixture } from "../lib/fixture";

test("incidents lists down before slow, and leaves operational services out", () => {
  const ids = incidents(fixture()).map((s) => [s.id, s.status]);
  assert.deepEqual(ids, [["nearai-embeddings", "down"], ["near-intents-quote", "down"], ["agent-market", "degraded"]]);
});

test("ago and pct read like the page means", () => {
  const now = Date.parse("2026-11-13T00:00:00Z");
  assert.equal(ago("2026-11-12T23:59:30Z", now), "30 s ago");
  assert.equal(ago("2026-11-12T23:57:00Z", now), "3 min ago");
  assert.equal(ago("2026-11-12T21:00:00Z", now), "3 h ago");
  assert.equal(ago(null, now), "never");
  assert.equal(pct(99.954), "99.95% uptime");
  assert.equal(pct(null), "No data");
});

test("every fixture service has 48 half-hour buckets, oldest first", () => {
  for (const s of fixture().services) {
    assert.equal(s.history.length, 48, s.id);
    assert.ok(Date.parse(s.history[0].start) < Date.parse(s.history[47].start), s.id);
  }
});
