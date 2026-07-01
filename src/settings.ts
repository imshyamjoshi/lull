// Settings load/save via tauri-plugin-store, with defaults and validation.
//
// FR5: missing or corrupt settings must fall back to defaults without crashing.
// Every value read from disk is validated and clamped before use.

import { load, type Store } from "@tauri-apps/plugin-store";
import { SETTINGS_FILE } from "./config.ts";
import type { TimerConfig } from "./state.ts";

export interface Settings {
  focusMinutes: number;
  shortRestMinutes: number;
  longRestMinutes: number;
  blocksBeforeLongRest: number;
  autoStart: boolean;
  fullscreenRest: boolean;
  sound: boolean;
  /** Optional native notification at transitions (default off). */
  notify: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortRestMinutes: 5,
  longRestMinutes: 15,
  blocksBeforeLongRest: 4,
  autoStart: true,
  fullscreenRest: true,
  sound: true,
  notify: false,
};

const MINUTES_MIN = 1;
const MINUTES_MAX = 180;
const BLOCKS_MIN = 1;
const BLOCKS_MAX = 12;

const STORE_KEY = "settings";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Coerce an arbitrary (possibly corrupt) object into valid Settings. */
export function normalize(raw: unknown): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    focusMinutes: clampInt(o.focusMinutes, MINUTES_MIN, MINUTES_MAX, d.focusMinutes),
    shortRestMinutes: clampInt(o.shortRestMinutes, MINUTES_MIN, MINUTES_MAX, d.shortRestMinutes),
    longRestMinutes: clampInt(o.longRestMinutes, MINUTES_MIN, MINUTES_MAX, d.longRestMinutes),
    blocksBeforeLongRest: clampInt(o.blocksBeforeLongRest, BLOCKS_MIN, BLOCKS_MAX, d.blocksBeforeLongRest),
    autoStart: asBool(o.autoStart, d.autoStart),
    fullscreenRest: asBool(o.fullscreenRest, d.fullscreenRest),
    sound: asBool(o.sound, d.sound),
    notify: asBool(o.notify, d.notify),
  };
}

/** Convert user-facing minutes into the ms-based config the reducer uses. */
export function toTimerConfig(s: Settings): TimerConfig {
  return {
    focusMs: s.focusMinutes * 60_000,
    shortRestMs: s.shortRestMinutes * 60_000,
    longRestMs: s.longRestMinutes * 60_000,
    blocksBeforeLongRest: s.blocksBeforeLongRest,
    autoStart: s.autoStart,
  };
}

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(SETTINGS_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

/** Load settings, merging stored values over defaults. Never throws. */
export async function loadSettings(): Promise<Settings> {
  try {
    const store = await getStore();
    const raw = await store.get<unknown>(STORE_KEY);
    return normalize(raw);
  } catch {
    // Corrupt/missing file or store failure -> defaults (FR5).
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist a full settings object. Returns the normalized value written. */
export async function saveSettings(next: Settings): Promise<Settings> {
  const clean = normalize(next);
  try {
    const store = await getStore();
    await store.set(STORE_KEY, clean);
    await store.save();
  } catch {
    // Best-effort: if persistence fails we still run with the in-memory value.
  }
  return clean;
}
