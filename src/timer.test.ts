import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, remainingMs, createTicker, splitHMS, hmsToMs } from "./timer.ts";

test("formatClock renders M:SS with un-padded minutes and padded seconds", () => {
  assert.equal(formatClock(25 * 60_000), "25:00");
  assert.equal(formatClock(5 * 60_000), "5:00");
  assert.equal(formatClock(18_000), "0:18");
  assert.equal(formatClock(0), "0:00");
});

test("formatClock renders H:MM:SS once there is at least an hour", () => {
  assert.equal(formatClock(60 * 60_000), "1:00:00");
  assert.equal(formatClock(90 * 60_000), "1:30:00");
  assert.equal(formatClock(2 * 3600_000 + 5 * 60_000 + 9_000), "2:05:09");
});

test("formatClock rounds seconds up so a fresh block shows its full duration", () => {
  assert.equal(formatClock(24 * 60_000 + 30_001), "24:31");
  assert.equal(formatClock(1), "0:01");
});

test("formatClock clamps negatives to 0:00", () => {
  assert.equal(formatClock(-5000), "0:00");
});

test("splitHMS / hmsToMs round-trip", () => {
  assert.deepEqual(splitHMS(25 * 60_000), { h: 0, m: 25, s: 0 });
  assert.deepEqual(splitHMS(3600_000 + 2 * 60_000 + 3_000), { h: 1, m: 2, s: 3 });
  assert.equal(hmsToMs(1, 2, 3), 3600_000 + 2 * 60_000 + 3_000);
  assert.equal(hmsToMs(0, 25, 0), 25 * 60_000);
});

test("remainingMs clamps at zero", () => {
  assert.equal(remainingMs(1000, 400), 600);
  assert.equal(remainingMs(1000, 1000), 0);
  assert.equal(remainingMs(1000, 5000), 0);
});

test("createTicker starts, fires immediately, and stops", async () => {
  let count = 0;
  const ticker = createTicker(() => count++, 10);
  assert.equal(ticker.running, false);
  ticker.start();
  assert.equal(ticker.running, true);
  assert.equal(count, 1, "fires once immediately on start");
  await new Promise((r) => setTimeout(r, 35));
  ticker.stop();
  assert.equal(ticker.running, false);
  assert.ok(count >= 3, `expected multiple ticks, got ${count}`);
  const frozen = count;
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(count, frozen, "no ticks after stop");
});
