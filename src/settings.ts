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

/** A named focus/rest cycle, either built-in (see main.ts) or user-saved. */
export interface Preset {
  id: string;
  label: string;
  focusSeconds: number;
  shortRestSeconds: number;
  longRestSeconds: number;
  blocksBeforeLongRest: number;
}

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
  /** Launch the app on Windows login (OS autostart, distinct from `autoStart`). */
  launchOnLogin: boolean;
  /** Ctrl+Shift+Space toggles start/pause from any app. */
  globalShortcutEnabled: boolean;
  /** Every ~20 min of focus, a brief fullscreen "look 20ft away" prompt. */
  microBreaksEnabled: boolean;
  /** Slow, non-pulsing breathing circle on the rest screen (off by default). */
  breathingCircleEnabled: boolean;
  /** User-saved cycle presets, shown as chips alongside the built-in ones. */
  customPresets: Preset[];
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
  launchOnLogin: false,
  globalShortcutEnabled: true,
  microBreaksEnabled: false,
  breathingCircleEnabled: false,
  customPresets: [],
};

const MAX_CUSTOM_PRESETS = 20;
const PRESET_LABEL_MAX = 24;

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

/** Coerce one arbitrary (possibly corrupt) preset; drops it entirely if unusable. */
function asPreset(raw: unknown): Preset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : null;
  const label = typeof o.label === "string" ? o.label.trim().slice(0, PRESET_LABEL_MAX) : "";
  if (!id || !label) return null;
  const d = DEFAULT_SETTINGS;
  return {
    id,
    label,
    focusSeconds: clampInt(o.focusSeconds, SECONDS_MIN, SECONDS_MAX, d.focusSeconds),
    shortRestSeconds: clampInt(o.shortRestSeconds, SECONDS_MIN, SECONDS_MAX, d.shortRestSeconds),
    longRestSeconds: clampInt(o.longRestSeconds, SECONDS_MIN, SECONDS_MAX, d.longRestSeconds),
    blocksBeforeLongRest: clampInt(o.blocksBeforeLongRest, BLOCKS_MIN, BLOCKS_MAX, d.blocksBeforeLongRest),
  };
}

function asPresetArray(value: unknown): Preset[] {
  if (!Array.isArray(value)) return [];
  const out: Preset[] = [];
  for (const item of value) {
    const p = asPreset(item);
    if (p) out.push(p);
    if (out.length >= MAX_CUSTOM_PRESETS) break;
  }
  return out;
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
    launchOnLogin: asBool(o.launchOnLogin, d.launchOnLogin),
    globalShortcutEnabled: asBool(o.globalShortcutEnabled, d.globalShortcutEnabled),
    microBreaksEnabled: asBool(o.microBreaksEnabled, d.microBreaksEnabled),
    breathingCircleEnabled: asBool(o.breathingCircleEnabled, d.breathingCircleEnabled),
    customPresets: asPresetArray(o.customPresets),
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
