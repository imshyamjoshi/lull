# ARCHITECTURE.md — Lull

## Stack decision

**Tauri v2 + vanilla TypeScript (Vite) + Rust.**

Why Tauri over Electron:
- Bundle is ~10–15 MB vs Electron's ~100+ MB. "Minimal" should extend to disk footprint.
- Uses the OS WebView2 (preinstalled on Windows 11) instead of shipping Chromium.
- Idle RAM and CPU are far lower — appropriate for an app that runs all day.

Why vanilla TS (no React/Vue/Svelte):
- The whole UI is a timer, a few controls, a settings panel, and a rest screen.
- A framework would be dead weight. Plain TS keeps the bundle tiny and the code obvious.
- Full pixel control over a stark black UI with no framework styling to fight.

Why Rust in the loop at all:
- Windowing (the fullscreen rest window), system tray, global shortcuts, autostart,
  and single-instance all need the native layer. The timer logic itself stays in TS.

If you ever hit a wall with Tauri fullscreen/multi-monitor, Electron is the fallback —
but only with an `AI_RULES.md` exception and a `DEVLOG.md` entry. Do not switch silently.

## Prerequisites

- Rust stable (via rustup), `rustc` 1.77+.
- Node.js 20 LTS or newer.
- Windows 10/11 x64. WebView2 runtime (bundle the bootstrapper in the installer for Win 10).

## Project layout

```
lull/
├── CLAUDE.md  PRD.md  UX_FLOWS.md  ARCHITECTURE.md  AI_RULES.md  BUILD_PLAN.md  COST.md  DEVLOG.md
├── package.json
├── vite.config.ts
├── index.html                 # main timer window
├── rest.html                  # fullscreen rest window (separate entry)
├── public/
│   ├── icon.png
│   └── chime.wav              # short, soft transition sound
├── src/
│   ├── main.ts                # boots main window, owns the state machine + render loop
│   ├── rest.ts                # boots rest window, renders the "look away" countdown
│   ├── timer.ts               # drift-corrected countdown engine (pure-ish, testable)
│   ├── state.ts               # state enum + pure transition functions + types
│   ├── settings.ts            # load/save settings via the store plugin, with defaults
│   ├── audio.ts               # chime playback (respects the sound setting)
│   ├── dom.ts                 # tiny DOM helpers (no framework)
│   └── styles.css             # design tokens + both screens' styles
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json        # windows, bundle (MSI+NSIS), plugins config
    ├── capabilities/
    │   └── default.json       # least-privilege permissions (NO network perms)
    └── src/
        ├── main.rs            # thin entry -> lib::run()
        ├── lib.rs             # builder: plugins, setup, single-instance, tray, shortcuts
        ├── windows.rs         # create/show/hide the rest window (fullscreen, always-on-top)
        └── tray.rs            # P1: system tray icon + menu
```

## Windows

Two webview windows:

1. **`main`** — the timer + settings. Small (e.g. 360×420), custom-drawn title bar,
   draggable via `data-tauri-drag-region`. Decorations minimal or off. Optionally
   always-on-top (P1 toggle).

2. **`rest`** — the "look away" screen. Created/shown when a focus block ends. Config:
   `fullscreen: true`, `alwaysOnTop: true`, `decorations: false`, `skipTaskbar: true`,
   `focus: true`. Loads `rest.html`. Hidden/closed when the rest countdown ends.

Create the rest window from Rust (`windows.rs`) using `WebviewWindowBuilder`, or from
JS with `WebviewWindow` from `@tauri-apps/api/webviewWindow`. Prefer creating it once
(hidden) and toggling `show()/hide()` + `setFullscreen(true)` to avoid create-cost each cycle.

**Multi-monitor (P2):** for a true blackout, create one rest window per monitor
(`availableMonitors()`), each fullscreen on its monitor. v1 (P0) only needs to cover
the current monitor.

## State machine (`state.ts`)

```
type Phase = 'idle' | 'focusRunning' | 'focusPaused' | 'restRunning'

interface AppState {
  phase: Phase
  msRemaining: number
  targetEndAt: number | null   // epoch ms; source of truth while running
  completedFocusBlocks: number // resets when a long rest completes
  isLongRest: boolean
}
```

Transitions are **pure functions**: `(state, event) -> state`. Events: `START`,
`PAUSE`, `RESUME`, `RESET`, `TICK`, `FOCUS_COMPLETE`, `REST_COMPLETE`, `SKIP_REST`.
Side effects (showing the rest window, playing the chime, notifications) are handled
by the caller reacting to the new phase — keep them out of the transition functions.

## Timer engine (`timer.ts`)

- Store a `targetEndAt` epoch timestamp when a block starts/resumes.
- On each animation frame or ~250 ms interval, compute `msRemaining = targetEndAt - Date.now()`.
- This survives sleep/wake and tab throttling — **never** decrement a counter each tick.
- On pause, store `msRemaining`; on resume, recompute `targetEndAt = Date.now() + msRemaining`.
- Fire `FOCUS_COMPLETE` / `REST_COMPLETE` when `msRemaining <= 0`.

## Persistence

- **`tauri-plugin-store`** — a single `settings.json` in the app config dir.
- `settings.ts` exposes `loadSettings()` (merges stored values over defaults) and
  `saveSettings(patch)`. Corrupt/missing file → defaults, no crash (FR5).
- No database. Settings are a flat object.

## Plugins (add only what a phase needs)

| Plugin | Package | Used for | Phase |
|--------|---------|----------|-------|
| store | `tauri-plugin-store` / `@tauri-apps/plugin-store` | persist settings | P0 |
| notification | `tauri-plugin-notification` / `@tauri-apps/plugin-notification` | transition alerts | P0/P1 |
| single-instance | `tauri-plugin-single-instance` | one running copy | P0 |
| global-shortcut | `tauri-plugin-global-shortcut` / `@tauri-apps/plugin-global-shortcut` | start/pause anywhere | P1 |
| autostart | `tauri-plugin-autostart` / `@tauri-apps/plugin-autostart` | launch on login | P1 |

Do **not** add the `http`, `upload`, or `websocket` plugins. This app never touches the network.

## Capabilities / security

- `src-tauri/capabilities/default.json` enables **only** the permissions actually used
  (store read/write, notification, the specific window/global-shortcut/autostart perms).
- No `http`/network capability. No filesystem scope beyond the store's own config file.
- No remote content — everything is bundled locally.

## Audio

- One short, soft `chime.wav` in `public/`. Play via the WebView's `Audio` API in
  `audio.ts`, gated on the sound setting. Keep volume low. No external sound fetches.

## Packaging

- `npm run tauri build` → MSI + NSIS installer under `src-tauri/target/release/bundle`.
- For Windows 10 targets, bundle the WebView2 bootstrapper (Tauri config `webviewInstallMode`).
- Set app name, identifier, version, and icon in `tauri.conf.json`.
- Code signing is optional for personal use (self-signed) and a paid cert only if
  distributing widely — see `COST.md`.

## Data flow (one focus→rest cycle)

```
user presses Start
  main.ts: START -> focusRunning, targetEndAt = now + focusMs
  timer.ts ticks -> updates msRemaining -> main.ts renders digits
  msRemaining <= 0 -> FOCUS_COMPLETE
    -> play chime (if on), optional notification
    -> show rest window (fullscreen, always-on-top), start rest countdown
  rest countdown hits 0 -> REST_COMPLETE
    -> hide rest window
    -> if autostart: START next focus; else -> idle "ready"
```
