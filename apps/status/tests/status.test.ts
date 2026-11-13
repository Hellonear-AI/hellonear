import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, duration, incidentDays, incidents, levelOf, pct } from "../lib/status";
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
  assert.equal(ago("2026-11-12T23:59:58Z", now), "just now");
  assert.equal(pct(99.954), "99.95% uptime");
  assert.equal(pct(null), "No data");
});

test("every fixture service has 48 half-hour buckets, oldest first", () => {
  for (const s of fixture().services) {
    assert.equal(s.history.length, 48, s.id);
    assert.ok(Date.parse(s.history[0].start) < Date.parse(s.history[47].start), s.id);
  }
});

test("past incidents: 7 UTC days newest first, quiet days empty, durations readable", () => {
  const now = Date.parse("2026-11-13T03:00:00Z");
  const list = [
    { service: "a", name: "A", status: "down" as const, start: "2026-11-13T01:00:00Z", end: null, minutes: 120, detail: null },
    { service: "b", name: "B", status: "degraded" as const, start: "2026-11-11T10:00:00Z", end: "2026-11-11T10:30:00Z", minutes: 30, detail: "slow" },
  ];
  const days = incidentDays(list, 7, now);
  assert.equal(days.length, 7);
  assert.equal(days[0].day, "2026-11-13");
  assert.equal(days[0].items.length, 1);
  assert.equal(days[1].items.length, 0);
  assert.equal(days[2].items[0].service, "b");
  assert.equal(duration(35), "35 min");
  assert.equal(duration(160), "2 h 40 min");
  assert.equal(duration(120), "2 h");
});

test("bar colours: green all fine, yellow some failed or slow, red all failed", () => {
  const b = (status: "operational" | "degraded" | "down" | "none", checks?: number, bad?: number) => ({ start: "2026-11-13T00:00:00Z", status, checks, bad });
  assert.equal(levelOf(b("operational", 6, 0)), "ok");
  assert.equal(levelOf(b("down", 6, 3)), "partial");
  assert.equal(levelOf(b("down", 6, 6)), "major");
  assert.equal(levelOf(b("degraded", 6, 6)), "partial");
  assert.equal(levelOf(b("down")), "major", "no counts: the bucket status decides");
  assert.equal(levelOf(b("none", 0, 0)), "none");
});
