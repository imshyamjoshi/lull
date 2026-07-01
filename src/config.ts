// Single source of truth for app-wide constants.
// "Lull" is a placeholder name — change APP_NAME here to rename everywhere in the UI.
// (The native/window/bundle name also lives in src-tauri/tauri.conf.json.)
export const APP_NAME = "Lull";

// Persistence: the store plugin writes this file in the app config dir.
export const SETTINGS_FILE = "settings.json";

// How long the user must hold Esc on the rest screen to skip (ms).
export const REST_SKIP_HOLD_MS = 2000;

// Timer poll interval. Timestamp-driven, so this only affects UI smoothness,
// not accuracy. 250ms keeps idle CPU near zero while digits stay responsive.
export const TICK_MS = 250;

// Cross-window event channel names.
export const EVT = {
  // main -> rest: begin a rest with an absolute end timestamp.
  restBegin: "lull://rest-begin",
  // rest -> main: user deliberately skipped the rest (held Esc).
  restSkip: "lull://rest-skip",
} as const;
