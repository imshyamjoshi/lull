// Timestamp-driven countdown engine.
//
// Correctness requirement (AI_RULES.md): remaining time is always computed from
// an absolute target timestamp, never by decrementing a per-tick counter. This
// survives sleep/wake and background throttling.

/** Remaining ms until `targetEndAt`, clamped at 0. */
export function remainingMs(targetEndAt: number, now: number): number {
  return Math.max(0, targetEndAt - now);
}

/**
 * Format ms as `M:SS` (minutes un-padded, seconds two digits). Seconds are
 * rounded up so a fresh 25-minute block reads "25:00" and only hits "0:00" when
 * truly elapsed.
 */
export function formatMMSS(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * A simple wall-clock poller. Calls `onTick(now)` every `intervalMs` using
 * setInterval (not requestAnimationFrame) so it keeps running when the window
 * is hidden or covered by the fullscreen rest screen.
 */
export interface Ticker {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

export function createTicker(onTick: (now: number) => void, intervalMs: number): Ticker {
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      if (handle !== null) return;
      handle = setInterval(() => onTick(Date.now()), intervalMs);
      // Fire once immediately so the UI updates without waiting a full interval.
      onTick(Date.now());
    },
    stop() {
      if (handle === null) return;
      clearInterval(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
  };
}
