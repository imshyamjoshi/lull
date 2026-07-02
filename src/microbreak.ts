// Pure scheduling logic for 20-20-20 micro-breaks, layered on top of a running
// focus block.
//
// Deliberately kept out of state.ts: the main reducer only knows idle/focus/
// rest. A micro-break is realized by pausing/resuming the real focus countdown
// via the existing PAUSE/RESUME events (see main.ts) — this module only decides
// *when* that should happen. Same timestamp-driven discipline as state.ts:
// `targetEndAt`/`endsAt` are the sources of truth while counting; `msRemaining`
// is the snapshot while paused.

import { MICRO_BREAK_DURATION_MS, MICRO_BREAK_INTERVAL_MS } from "./config.ts";

export interface MicroBreakState {
  /** Remaining ms until the next micro-break is due, snapshotted while not counting. */
  msRemaining: number;
  /** Absolute time the next micro-break is due; null while not counting. */
  targetEndAt: number | null;
  /** True while the micro-break overlay itself is showing. */
  active: boolean;
  /** Absolute time the current micro-break ends; null when not active. */
  endsAt: number | null;
}

export function initMicroBreak(): MicroBreakState {
  return { msRemaining: MICRO_BREAK_INTERVAL_MS, targetEndAt: null, active: false, endsAt: null };
}

/** Call when the focus timer starts or resumes running (entering "focusRunning"). */
export function enterFocus(
  s: MicroBreakState,
  opts: { freshBlock: boolean; enabled: boolean; now: number },
): MicroBreakState {
  let msRemaining = s.msRemaining;
  let active = s.active;
  let endsAt = s.endsAt;
  if (active) {
    // The RESUME that just fired ends an in-progress micro-break — whether it
    // timed out on its own or was ended early by the user/tray/hotkey. Either
    // way, start counting a fresh interval from now.
    active = false;
    endsAt = null;
    msRemaining = MICRO_BREAK_INTERVAL_MS;
  } else if (opts.freshBlock) {
    msRemaining = MICRO_BREAK_INTERVAL_MS;
  }
  return {
    msRemaining,
    active,
    endsAt,
    targetEndAt: opts.enabled ? opts.now + msRemaining : null,
  };
}

/** Call when the focus timer stops running (pause, or the block completes). */
export function leaveFocus(s: MicroBreakState, now: number): MicroBreakState {
  const msRemaining = s.targetEndAt !== null ? Math.max(0, s.targetEndAt - now) : s.msRemaining;
  return { ...s, msRemaining, targetEndAt: null };
}

/** Call on anything that can jump straight to idle mid-micro-break (e.g. RESET). */
export function cancel(s: MicroBreakState): MicroBreakState {
  if (!s.active) return s;
  return { ...s, active: false, endsAt: null, msRemaining: MICRO_BREAK_INTERVAL_MS };
}

/** Call when the setting is toggled while a focus block is running. */
export function reschedule(s: MicroBreakState, enabled: boolean, now: number): MicroBreakState {
  if (s.active) return s;
  return { ...s, targetEndAt: enabled ? now + s.msRemaining : null };
}

export function isDue(s: MicroBreakState, now: number): boolean {
  return !s.active && s.targetEndAt !== null && now >= s.targetEndAt;
}

export function isElapsed(s: MicroBreakState, now: number): boolean {
  return s.active && s.endsAt !== null && now >= s.endsAt;
}

/** Begin the break overlay (call once `isDue()` is true). */
export function begin(s: MicroBreakState, now: number): MicroBreakState {
  return { ...s, active: true, endsAt: now + MICRO_BREAK_DURATION_MS };
}
