// Single source of truth for app-wide constants.
// Change APP_NAME here to rename everywhere in the UI.
// (The native/window/bundle name also lives in src-tauri/tauri.conf.json.)
export const APP_NAME = "Blink";

// Persistence: the store plugin writes this file in the app config dir.
export const SETTINGS_FILE = "settings.json";

// Daily focus count + streak, persisted separately from settings.
export const STATS_FILE = "stats.json";

// How long the user must hold Esc on the rest screen to skip (ms).
export const REST_SKIP_HOLD_MS = 2000;

// 20-20-20: every 20 min of focus, look ~20 ft away for 20 s. Fixed cadence,
// not user-configurable — only on/off (Settings > "20-20-20 micro-breaks").
export const MICRO_BREAK_INTERVAL_MS = 20 * 60 * 1000;
export const MICRO_BREAK_DURATION_MS = 20 * 1000;

// Timer poll interval. Timestamp-driven, so this only affects UI smoothness,
// not accuracy. 250ms keeps idle CPU near zero while digits stay responsive.
export const TICK_MS = 250;

// Cross-window event channel names.
export const EVT = {
  // main -> rest: begin a rest with an absolute end timestamp.
  restBegin: "blink://rest-begin",
  // rest -> main: user deliberately skipped the rest (held Esc).
  restSkip: "blink://rest-skip",
  // rest -> main: a rest window finished loading and is ready for its payload.
  restReady: "blink://rest-ready",
  // Rust tray -> main: toggle start/pause from the tray menu.
  trayToggle: "blink://tray-toggle",
  // Rust global shortcut -> main: toggle start/pause from anywhere.
  hotkeyToggle: "blink://hotkey-toggle",
} as const;

// Label prefix for the per-monitor rest ("look away") windows.
export const REST_WINDOW_PREFIX = "rest-";
