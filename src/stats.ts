// Minimal local-only daily focus count + day streak. Persisted separately from
// settings.ts via its own store file, same load/save/validate shape (FR5:
// missing or corrupt data falls back to defaults without crashing).

import { load, type Store } from "@tauri-apps/plugin-store";
import { STATS_FILE } from "./config.ts";

export interface Stats {
  /** Local YYYY-MM-DD of the last recorded focus-block completion; "" if none yet. */
  lastActiveDate: string;
  focusBlocksToday: number;
  focusSecondsToday: number;
  streakDays: number;
}

export const DEFAULT_STATS: Stats = {
  lastActiveDate: "",
  focusBlocksToday: 0,
  focusSecondsToday: 0,
  streakDays: 0,
};

/** Local calendar date (not UTC) so the "day" matches what the user sees. */
export function todayString(now: number): string {
  return toDateString(new Date(now));
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return toDateString(dt);
}

/**
 * Record one completed focus block. `today` is the caller's current local date
 * (see `todayString`) so this stays deterministic and testable.
 */
export function recordFocusBlock(stats: Stats, today: string, focusSeconds: number): Stats {
  if (today === stats.lastActiveDate) {
    return {
      ...stats,
      focusBlocksToday: stats.focusBlocksToday + 1,
      focusSecondsToday: stats.focusSecondsToday + focusSeconds,
    };
  }
  const continuesStreak = stats.lastActiveDate !== "" && stats.lastActiveDate === dayBefore(today);
  return {
    lastActiveDate: today,
    focusBlocksToday: 1,
    focusSecondsToday: focusSeconds,
    streakDays: continuesStreak ? stats.streakDays + 1 : 1,
  };
}

function asDateStr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function asNonNegInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** Coerce an arbitrary (possibly corrupt) object into valid Stats. */
export function normalizeStats(raw: unknown): Stats {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_STATS;
  return {
    lastActiveDate: asDateStr(o.lastActiveDate, d.lastActiveDate),
    focusBlocksToday: asNonNegInt(o.focusBlocksToday, d.focusBlocksToday),
    focusSecondsToday: asNonNegInt(o.focusSecondsToday, d.focusSecondsToday),
    streakDays: asNonNegInt(o.streakDays, d.streakDays),
  };
}

const STORE_KEY = "stats";

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load(STATS_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

/** Load stats, validating stored values. Never throws. */
export async function loadStats(): Promise<Stats> {
  try {
    const store = await getStore();
    const raw = await store.get<unknown>(STORE_KEY);
    return normalizeStats(raw);
  } catch {
    return { ...DEFAULT_STATS };
  }
}

/** Persist a full stats object. Returns the normalized value written. */
export async function saveStats(next: Stats): Promise<Stats> {
  const clean = normalizeStats(next);
  try {
    const store = await getStore();
    await store.set(STORE_KEY, clean);
    await store.save();
  } catch {
    // Best-effort: if persistence fails we still run with the in-memory value.
  }
  return clean;
}
