import { test } from "node:test";
import assert from "node:assert/strict";
import { reduce, initialState, isLongRestAfter, type TimerConfig, type AppState } from "./state.ts";

const MIN = 60_000;
const cfg: TimerConfig = {
  focusMs: 25 * MIN,
  shortRestMs: 5 * MIN,
  longRestMs: 15 * MIN,
  blocksBeforeLongRest: 4,
  autoStart: true,
};

const noAuto: TimerConfig = { ...cfg, autoStart: false };

test("initialState is idle showing the focus duration", () => {
  const s = initialState(cfg);
  assert.equal(s.phase, "idle");
  assert.equal(s.msRemaining, cfg.focusMs);
  assert.equal(s.targetEndAt, null);
  assert.equal(s.completedFocusBlocks, 0);
});

test("START from idle begins a focus block ending at now + focusMs", () => {
  const s = reduce(initialState(cfg), { type: "START" }, cfg, 1000);
  assert.equal(s.phase, "focusRunning");
  assert.equal(s.targetEndAt, 1000 + cfg.focusMs);
  assert.equal(s.msRemaining, cfg.focusMs);
});

test("START is ignored when not idle", () => {
  const running = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  const again = reduce(running, { type: "START" }, cfg, 5000);
  assert.deepEqual(again, running);
});

test("pause then resume preserves remaining time with no drift", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 1000);
  // 10s into the block.
  s = reduce(s, { type: "PAUSE" }, cfg, 1000 + 10_000);
  assert.equal(s.phase, "focusPaused");
  assert.equal(s.msRemaining, cfg.focusMs - 10_000);
  assert.equal(s.targetEndAt, null);
  // Resume 50s later — remaining must be unchanged.
  s = reduce(s, { type: "RESUME" }, cfg, 1000 + 60_000);
  assert.equal(s.phase, "focusRunning");
  assert.equal(s.targetEndAt, 1000 + 60_000 + (cfg.focusMs - 10_000));
  // And a TICK right after resume still shows the same remaining.
  s = reduce(s, { type: "TICK", now: 1000 + 60_000 }, cfg, 1000 + 60_000);
  assert.equal(s.msRemaining, cfg.focusMs - 10_000);
});

test("TICK recomputes remaining from the timestamp", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  s = reduce(s, { type: "TICK", now: 90_000 }, cfg, 90_000);
  assert.equal(s.msRemaining, cfg.focusMs - 90_000);
});

test("sleep/wake: a TICK past the end clamps remaining to 0", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  // Machine slept well past the block end.
  s = reduce(s, { type: "TICK", now: cfg.focusMs + 5 * MIN }, cfg, cfg.focusMs + 5 * MIN);
  assert.equal(s.msRemaining, 0);
});

test("RESET returns to idle at full duration but keeps set progress", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs); // 1 block done
  s = reduce(s, { type: "REST_COMPLETE" }, noAuto, cfg.focusMs); // land idle
  s = reduce(s, { type: "START" }, cfg, 100_000);
  const progressBefore = s.completedFocusBlocks;
  s = reduce(s, { type: "RESET" }, cfg, 130_000);
  assert.equal(s.phase, "idle");
  assert.equal(s.msRemaining, cfg.focusMs);
  assert.equal(s.targetEndAt, null);
  assert.equal(s.completedFocusBlocks, progressBefore);
});

test("FOCUS_COMPLETE triggers short rest for blocks 1-3, long rest on the 4th", () => {
  assert.equal(isLongRestAfter(1, 4), false);
  assert.equal(isLongRestAfter(4, 4), true);

  let s: AppState = initialState(cfg);
  // Blocks 1,2,3 -> short rests.
  for (let i = 1; i <= 3; i++) {
    s = reduce(s, { type: "START" }, cfg, 0);
    s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
    assert.equal(s.phase, "restRunning");
    assert.equal(s.isLongRest, false);
    assert.equal(s.msRemaining, cfg.shortRestMs, `block ${i} should be a short rest`);
    assert.equal(s.completedFocusBlocks, i);
    s = reduce(s, { type: "REST_COMPLETE" }, noAuto, 0);
  }
  // Block 4 -> long rest.
  s = reduce(s, { type: "START" }, cfg, 0);
  s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
  assert.equal(s.isLongRest, true);
  assert.equal(s.msRemaining, cfg.longRestMs);
  assert.equal(s.completedFocusBlocks, 4);
});

test("completing a long rest resets the set to 0", () => {
  let s: AppState = initialState(cfg);
  for (let i = 1; i <= 4; i++) {
    s = reduce(s, { type: "START" }, cfg, 0);
    s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
    s = reduce(s, { type: "REST_COMPLETE" }, noAuto, 0);
  }
  assert.equal(s.completedFocusBlocks, 0);
  assert.equal(s.phase, "idle");
});

test("REST_COMPLETE auto-starts the next focus when autoStart is on", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
  s = reduce(s, { type: "REST_COMPLETE" }, cfg, 1_000_000);
  assert.equal(s.phase, "focusRunning");
  assert.equal(s.targetEndAt, 1_000_000 + cfg.focusMs);
});

test("REST_COMPLETE lands on idle 'ready' when autoStart is off", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
  s = reduce(s, { type: "REST_COMPLETE" }, noAuto, 1_000_000);
  assert.equal(s.phase, "idle");
  assert.equal(s.targetEndAt, null);
  assert.equal(s.msRemaining, cfg.focusMs);
});

test("SKIP_REST behaves like REST_COMPLETE", () => {
  let a = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  a = reduce(a, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
  const skipped = reduce(a, { type: "SKIP_REST" }, cfg, 500);
  const completed = reduce(a, { type: "REST_COMPLETE" }, cfg, 500);
  assert.deepEqual(skipped, completed);
});

test("RESET during rest is a no-op", () => {
  let s = reduce(initialState(cfg), { type: "START" }, cfg, 0);
  s = reduce(s, { type: "FOCUS_COMPLETE" }, cfg, cfg.focusMs);
  const after = reduce(s, { type: "RESET" }, cfg, cfg.focusMs + 1000);
  assert.deepEqual(after, s);
});
