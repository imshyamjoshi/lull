import { test } from "node:test";
import assert from "node:assert/strict";
import { recordFocusBlock, normalizeStats, todayString, DEFAULT_STATS } from "./stats.ts";

test("DEFAULT_STATS starts at zero with no last active date", () => {
  assert.equal(DEFAULT_STATS.lastActiveDate, "");
  assert.equal(DEFAULT_STATS.focusBlocksToday, 0);
  assert.equal(DEFAULT_STATS.streakDays, 0);
});

test("first block ever starts a 1-day streak", () => {
  const s = recordFocusBlock(DEFAULT_STATS, "2026-07-02", 1500);
  assert.equal(s.lastActiveDate, "2026-07-02");
  assert.equal(s.focusBlocksToday, 1);
  assert.equal(s.focusSecondsToday, 1500);
  assert.equal(s.streakDays, 1);
});

test("a second block the same day increments counts but not the streak", () => {
  let s = recordFocusBlock(DEFAULT_STATS, "2026-07-02", 1500);
  s = recordFocusBlock(s, "2026-07-02", 900);
  assert.equal(s.focusBlocksToday, 2);
  assert.equal(s.focusSecondsToday, 2400);
  assert.equal(s.streakDays, 1);
});

test("a block the very next day continues the streak and resets today's counts", () => {
  let s = recordFocusBlock(DEFAULT_STATS, "2026-07-02", 1500);
  s = recordFocusBlock(s, "2026-07-02", 1500);
  s = recordFocusBlock(s, "2026-07-03", 1500);
  assert.equal(s.streakDays, 2);
  assert.equal(s.focusBlocksToday, 1);
  assert.equal(s.focusSecondsToday, 1500);
});

test("a gap of more than one day resets the streak to 1", () => {
  let s = recordFocusBlock(DEFAULT_STATS, "2026-07-02", 1500);
  s = recordFocusBlock(s, "2026-07-05", 1500); // skipped 3 and 4
  assert.equal(s.streakDays, 1);
  assert.equal(s.focusBlocksToday, 1);
});

test("day boundary is exact across a month/year rollover", () => {
  let s = recordFocusBlock(DEFAULT_STATS, "2025-12-31", 1500);
  s = recordFocusBlock(s, "2026-01-01", 1500);
  assert.equal(s.streakDays, 2);
});

test("normalizeStats falls back to defaults for corrupt input", () => {
  assert.deepEqual(normalizeStats(null), DEFAULT_STATS);
  assert.deepEqual(normalizeStats({ lastActiveDate: "not-a-date", focusBlocksToday: -5 }), DEFAULT_STATS);
  const partial = normalizeStats({ focusBlocksToday: 3, streakDays: 2 });
  assert.equal(partial.focusBlocksToday, 3);
  assert.equal(partial.streakDays, 2);
  assert.equal(partial.lastActiveDate, "");
});

test("todayString formats using local calendar fields", () => {
  const d = new Date(2026, 6, 2, 23, 59); // July is month index 6
  assert.equal(todayString(d.getTime()), "2026-07-02");
});
