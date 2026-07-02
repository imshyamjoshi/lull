# Blink

A minimal, pitch-black Pomodoro timer for Windows that forces your eyes to rest
between focus blocks. When a focus block ends, Blink takes over the screen with a
pure-black "look away" rest screen and a countdown, then returns to the next block.

Offline, private, and free to run — no accounts, no telemetry, no network calls.

## Stack

- **Tauri v2** (Rust) — tiny native Windows binary, WebView2 runtime.
- **Vanilla TypeScript + Vite** — no UI framework.
- Rust only for windowing, tray, global shortcut, autostart, persistence, and notifications.

## Develop

Prerequisites: Rust (stable, MSVC), Node.js 20+, and the VS C++ Build Tools.

```bash
npm install
npm run tauri dev      # run in dev
npm run tauri build    # MSI + NSIS installer in src-tauri/target/release/bundle
```

Other scripts:

```bash
npm test               # timer + state unit tests (Node's built-in runner)
npm run typecheck      # tsc --noEmit
```

## Layout

```
index.html / rest.html   # the two webview windows
src/
  config.ts   state.ts   # constants; pure state machine
  timer.ts               # timestamp-driven countdown engine
  settings.ts            # load/save via the store plugin (+ defaults, validation)
  stats.ts               # daily focus count + streak, persisted separately
  audio.ts   icons.ts    # Web Audio chime; inline SVG icons
  dom.ts                 # tiny DOM helpers
  main.ts   rest.ts      # boot the timer window / rest window
  styles.css             # design tokens + both screens
src-tauri/               # Rust: plugins, windows, capabilities
```

## Project docs

`PRD.md`, `UX_FLOWS.md`, `ARCHITECTURE.md`, `AI_RULES.md`, `BUILD_PLAN.md`,
`COST.md`, and `DEVLOG.md` are the source of truth. Read them before changing code.

## Status

v1 (P0, phases 0–6) is implemented: focus/rest loop, fullscreen rest takeover,
session cycle with long rests, persisted settings, and a transition chime.
Iteration 2 added the native Fluent redesign, home-screen presets, system tray,
global shortcut, autostart, 20-20-20 micro-breaks, daily stats/streak, and an
opt-in guided breathing circle. See `DEVLOG.md` for details.
