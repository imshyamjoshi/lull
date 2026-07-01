// Pure state machine for the Pomodoro loop.
//
// Rules (see AI_RULES.md):
//  - Transitions are PURE functions: (state, event, cfg, now) -> state.
//  - No side effects here (no window/audio/notification). Callers react to the
//    new phase and perform effects.
//  - The countdown is timestamp-driven: while a block runs, `targetEndAt` is the
//    source of truth and `msRemaining` is a derived snapshot updated on TICK.

export type Phase = "idle" | "focusRunning" | "focusPaused" | "restRunning";

export interface AppState {
  phase: Phase;
  /** Derived snapshot of remaining time for the current block (ms). */
  msRemaining: number;
  /** Epoch ms when the current running block ends. Null when not running. */
  targetEndAt: number | null;
  /** Completed focus blocks in the current set; resets after a long rest. */
  completedFocusBlocks: number;
  /** True while the current rest (or the just-triggered rest) is a long rest. */
  isLongRest: boolean;
}

/** Durations + cycle config the reducer needs at block boundaries. */
export interface TimerConfig {
  focusMs: number;
  shortRestMs: number;
  longRestMs: number;
  /** Long rest triggers after every Nth completed focus block. */
  blocksBeforeLongRest: number;
  /** When true, the next block auto-starts; otherwise land on idle "ready". */
  autoStart: boolean;
}

export type AppEvent =
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "RESET" }
  | { type: "TICK"; now: number }
  | { type: "FOCUS_COMPLETE" }
  | { type: "REST_COMPLETE" }
  | { type: "SKIP_REST" };

/** Initial state: idle "ready", showing the configured focus duration. */
export function initialState(cfg: TimerConfig): AppState {
  return {
    phase: "idle",
    msRemaining: cfg.focusMs,
    targetEndAt: null,
    completedFocusBlocks: 0,
    isLongRest: false,
  };
}

/** Whether the rest following the block just completed should be a long rest. */
export function isLongRestAfter(completedFocusBlocks: number, n: number): boolean {
  return n > 0 && completedFocusBlocks % n === 0;
}

function clampRemaining(targetEndAt: number, now: number): number {
  return Math.max(0, targetEndAt - now);
}

/** Begin (or auto-start) a focus block ending at now + focusMs. */
function startFocus(state: AppState, cfg: TimerConfig, now: number): AppState {
  return {
    ...state,
    phase: "focusRunning",
    targetEndAt: now + cfg.focusMs,
    msRemaining: cfg.focusMs,
    isLongRest: false,
  };
}

/**
 * The single pure transition function. `now` (epoch ms) is passed in so this
 * stays deterministic and testable — never read the clock inside.
 */
export function reduce(
  state: AppState,
  event: AppEvent,
  cfg: TimerConfig,
  now: number,
): AppState {
  switch (event.type) {
    case "START": {
      // Only meaningful from idle "ready".
      if (state.phase !== "idle") return state;
      return startFocus(state, cfg, now);
    }

    case "PAUSE": {
      if (state.phase !== "focusRunning" || state.targetEndAt === null) return state;
      return {
        ...state,
        phase: "focusPaused",
        msRemaining: clampRemaining(state.targetEndAt, now),
        targetEndAt: null,
      };
    }

    case "RESUME": {
      if (state.phase !== "focusPaused") return state;
      return {
        ...state,
        phase: "focusRunning",
        targetEndAt: now + state.msRemaining,
      };
    }

    case "RESET": {
      // Reset the current focus block back to a ready state at full duration.
      // Does not touch the set progress (completedFocusBlocks). No-op in rest.
      if (state.phase !== "focusRunning" && state.phase !== "focusPaused") return state;
      return {
        ...state,
        phase: "idle",
        targetEndAt: null,
        msRemaining: cfg.focusMs,
        isLongRest: false,
      };
    }

    case "TICK": {
      // Recompute the derived snapshot from the source-of-truth timestamp.
      if (state.targetEndAt === null) return state;
      const msRemaining = clampRemaining(state.targetEndAt, event.now);
      if (msRemaining === state.msRemaining) return state;
      return { ...state, msRemaining };
    }

    case "FOCUS_COMPLETE": {
      if (state.phase !== "focusRunning") return state;
      const completedFocusBlocks = state.completedFocusBlocks + 1;
      const isLongRest = isLongRestAfter(completedFocusBlocks, cfg.blocksBeforeLongRest);
      const restMs = isLongRest ? cfg.longRestMs : cfg.shortRestMs;
      return {
        ...state,
        phase: "restRunning",
        completedFocusBlocks,
        isLongRest,
        targetEndAt: now + restMs,
        msRemaining: restMs,
      };
    }

    case "REST_COMPLETE":
    case "SKIP_REST": {
      if (state.phase !== "restRunning") return state;
      // A completed long rest closes the set.
      const completedFocusBlocks = state.isLongRest ? 0 : state.completedFocusBlocks;
      const base: AppState = {
        ...state,
        completedFocusBlocks,
        isLongRest: false,
        targetEndAt: null,
        msRemaining: cfg.focusMs,
        phase: "idle",
      };
      return cfg.autoStart ? startFocus(base, cfg, now) : base;
    }

    default:
      return state;
  }
}
