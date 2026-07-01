import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMMSS, remainingMs, createTicker } from "./timer.ts";

test("formatMMSS renders M:SS with un-padded minutes and padded seconds", () => {
  assert.equal(formatMMSS(25 * 60_000), "25:00");
  assert.equal(formatMMSS(5 * 60_000), "5:00");
  assert.equal(formatMMSS(18_000), "0:18");
  assert.equal(formatMMSS(0), "0:00");
});

test("formatMMSS rounds seconds up so a fresh block shows its full duration", () => {
  // 24:30.001 should read 24:31, not 24:30.
  assert.equal(formatMMSS(24 * 60_000 + 30_001), "24:31");
  // Just above a whole second rounds up.
  assert.equal(formatMMSS(1), "0:01");
});

test("formatMMSS clamps negatives to 0:00", () => {
  assert.equal(formatMMSS(-5000), "0:00");
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
