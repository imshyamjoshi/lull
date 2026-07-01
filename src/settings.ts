// Settings load/save via tauri-plugin-store, with defaults and validation.
//
// FR5: missing or corrupt settings must fall back to defaults without crashing.
// Every value read from disk is validated and clamped before use.
//
// Durations are stored in whole SECONDS so the home-screen editor can set
// hours/minutes/seconds directly.

import { load, type Store } from "@tauri-apps/plugin-store";
import { SETTINGS_FILE } from "./config.ts";
import type { TimerConfig } from "./state.ts";

export interface Settings {
  focusSeconds: number;
  shortRestSeconds: number;
  longRestSeconds: number;
  blocksBeforeLongRest: number;
  autoStart: boolean;
  fullscreenRest: boolean;
  sound: boolean;
  /** Optional native notification at transitions (default off). */
  notify: boolean;
  /** Keep the timer window above other windows. */
  alwaysOnTop: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focusSeconds: 25 * 60,
  shortRestSeconds: 5 * 60,
  longRestSeconds: 15 * 60,
  blocksBeforeLongRest: 4,
  autoStart: true,
  fullscreenRest: true,
  sound: true,
  notify: false,
  alwaysOnTop: false,
};

const SECONDS_MIN = 1;
const SECONDS_MAX = 24 * 60 * 60; // 24 hours
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
    focusSeconds: clampInt(o.focusSeconds, SECONDS_MIN, SECONDS_MAX, d.focusSeconds),
    shortRestSeconds: clampInt(o.shortRestSeconds, SECONDS_MIN, SECONDS_MAX, d.shortRestSeconds),
    longRestSeconds: clampInt(o.longRestSeconds, SECONDS_MIN, SECONDS_MAX, d.longRestSeconds),
    blocksBeforeLongRest: clampInt(o.blocksBeforeLongRest, BLOCKS_MIN, BLOCKS_MAX, d.blocksBeforeLongRest),
    autoStart: asBool(o.autoStart, d.autoStart),
    fullscreenRest: asBool(o.fullscreenRest, d.fullscreenRest),
    sound: asBool(o.sound, d.sound),
    notify: asBool(o.notify, d.notify),
    alwaysOnTop: asBool(o.alwaysOnTop, d.alwaysOnTop),
  };
}

/** Convert user-facing seconds into the ms-based config the reducer uses. */
export function toTimerConfig(s: Settings): TimerConfig {
  return {
    focusMs: s.focusSeconds * 1000,
    shortRestMs: s.shortRestSeconds * 1000,
    longRestMs: s.longRestSeconds * 1000,
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
