import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initMicroBreak,
  enterFocus,
  leaveFocus,
  cancel,
  reschedule,
  isDue,
  isElapsed,
  begin,
} from "./microbreak.ts";

const MIN = 60_000;
const INTERVAL = 20 * MIN;
const DURATION = 20_000;

test("initMicroBreak starts idle with a full interval and nothing scheduled", () => {
  const s = initMicroBreak();
  assert.equal(s.msRemaining, INTERVAL);
  assert.equal(s.targetEndAt, null);
  assert.equal(s.active, false);
  assert.equal(s.endsAt, null);
});

test("a fresh block schedules the first micro-break INTERVAL ms out", () => {
  const s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 1000 });
  assert.equal(s.targetEndAt, 1000 + INTERVAL);
  assert.equal(s.msRemaining, INTERVAL);
});

test("disabled: entering focus never schedules a target", () => {
  const s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: false, now: 1000 });
  assert.equal(s.targetEndAt, null);
});

test("pause then resume preserves remaining time with no drift (mirrors the main timer)", () => {
  let s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 });
  // 5 minutes into the block, the user pauses.
  s = leaveFocus(s, 5 * MIN);
  assert.equal(s.msRemaining, INTERVAL - 5 * MIN);
  assert.equal(s.targetEndAt, null);
  // Resume 2 minutes later (paused time doesn't count against the interval).
  s = enterFocus(s, { freshBlock: false, enabled: true, now: 7 * MIN });
  assert.equal(s.targetEndAt, 7 * MIN + (INTERVAL - 5 * MIN));
});

test("isDue fires once the target time passes, and not before", () => {
  const s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 });
  assert.equal(isDue(s, INTERVAL - 1), false);
  assert.equal(isDue(s, INTERVAL), true);
});

test("begin marks active and schedules the break's own end", () => {
  const due = enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 });
  const s = begin(due, INTERVAL);
  assert.equal(s.active, true);
  assert.equal(s.endsAt, INTERVAL + DURATION);
  assert.equal(isDue(s, INTERVAL), false); // already active, not due again
});

test("isElapsed fires once the break's own duration passes", () => {
  const s = begin(enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 }), INTERVAL);
  assert.equal(isElapsed(s, INTERVAL + DURATION - 1), false);
  assert.equal(isElapsed(s, INTERVAL + DURATION), true);
});

test("resuming out of an active break clears it and starts a fresh interval", () => {
  let s = begin(enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 }), INTERVAL);
  const resumeAt = INTERVAL + DURATION;
  s = enterFocus(s, { freshBlock: false, enabled: true, now: resumeAt });
  assert.equal(s.active, false);
  assert.equal(s.endsAt, null);
  assert.equal(s.msRemaining, INTERVAL);
  assert.equal(s.targetEndAt, resumeAt + INTERVAL);
});

test("a new focus block (freshBlock) resets the interval even mid-way through the old one", () => {
  let s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 });
  s = leaveFocus(s, 3 * MIN); // block completes/pauses partway through
  s = enterFocus(s, { freshBlock: true, enabled: true, now: 100 * MIN }); // a brand new block later
  assert.equal(s.msRemaining, INTERVAL);
  assert.equal(s.targetEndAt, 100 * MIN + INTERVAL);
});

test("cancel is a no-op unless a break is active", () => {
  const idle = initMicroBreak();
  assert.deepEqual(cancel(idle), idle);

  const active = begin(enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 }), INTERVAL);
  const cancelled = cancel(active);
  assert.equal(cancelled.active, false);
  assert.equal(cancelled.endsAt, null);
  assert.equal(cancelled.msRemaining, INTERVAL);
});

test("reschedule turns scheduling on/off mid-block without touching msRemaining", () => {
  let s = enterFocus(initMicroBreak(), { freshBlock: true, enabled: false, now: 0 });
  assert.equal(s.targetEndAt, null);
  s = reschedule(s, true, 5 * MIN); // user flips the setting on mid-block
  assert.equal(s.targetEndAt, 5 * MIN + INTERVAL);
  s = reschedule(s, false, 6 * MIN); // flips off again
  assert.equal(s.targetEndAt, null);
  assert.equal(s.msRemaining, INTERVAL);
});

test("reschedule is a no-op while a break is active", () => {
  const active = begin(enterFocus(initMicroBreak(), { freshBlock: true, enabled: true, now: 0 }), INTERVAL);
  assert.deepEqual(reschedule(active, false, INTERVAL + 1000), active);
});
