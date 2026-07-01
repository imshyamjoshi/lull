// Timestamp-driven countdown engine.
//
// Correctness requirement (AI_RULES.md): remaining time is always computed from
// an absolute target timestamp, never by decrementing a per-tick counter. This
// survives sleep/wake and background throttling.

/** Remaining ms until `targetEndAt`, clamped at 0. */
export function remainingMs(targetEndAt: number, now: number): number {
  return Math.max(0, targetEndAt - now);
}

export interface HMS {
  h: number;
  m: number;
  s: number;
}

/** Split ms into whole hours/minutes/seconds (seconds rounded up). */
export function splitHMS(ms: number): HMS {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** Join hours/minutes/seconds back into ms. */
export function hmsToMs(h: number, m: number, s: number): number {
  return (h * 3600 + m * 60 + s) * 1000;
}

/**
 * Format ms for display. Shows `H:MM:SS` when there is at least one hour,
 * otherwise `M:SS` (minutes un-padded). Seconds are rounded up so a fresh block
 * reads its full duration and only hits zero when truly elapsed.
 */
export function formatClock(ms: number): string {
  const { h, m, s } = splitHMS(ms);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
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
