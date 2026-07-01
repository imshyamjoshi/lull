# BUILD_PLAN.md — Lull

Execute phases in order. Finish a phase's acceptance criteria before starting the
next. Append a `DEVLOG.md` entry when each phase is done. P0 = phases 0–6 (v1 ships
at the end of phase 6). P1/P2 = phases 7+.

---

## Phase 0 — Scaffold

- [ ] `npm create tauri-app@latest lull -- --template vanilla-ts`.
- [ ] App builds and runs an empty window (`npm run tauri dev`).
- [ ] Set app name, identifier, version, icon in `tauri.conf.json`.
- [ ] Add `tauri-plugin-single-instance`.
- [ ] Commit the 8 planning docs into the repo root.
- [ ] Confirm `npm run tauri build` produces an MSI/NSIS installer.

**Acceptance:** a blank Lull window launches in dev and a build artifact is produced.

---

## Phase 1 — Timer core (logic first, no UI polish)

- [ ] `state.ts`: `Phase`, `AppState`, and pure transition functions for
      `START / PAUSE / RESUME / RESET / TICK / FOCUS_COMPLETE / REST_COMPLETE / SKIP_REST`.
- [ ] `timer.ts`: timestamp-driven countdown (`targetEndAt`, recompute from `Date.now()`).
- [ ] Wire a temporary bare UI showing `MM:SS` + start/pause/reset buttons.
- [ ] Unit tests for state transitions and for pause/resume time accuracy.

**Acceptance:** a focus block counts down accurately, pauses/resumes without drift, and
survives a simulated clock jump (sleep) by finishing correctly.

---

## Phase 2 — Focus screen UI

- [ ] `styles.css` with the exact tokens from `UX_FLOWS.md` (pure black, teal accent).
- [ ] Build the focus screen: minimal draggable title bar + gear, phase label,
      oversized thin digits, two hairline control buttons, session dots.
- [ ] `aria-label`s on icon buttons; keyboard: `Space` = pause/resume, `R` = reset.
- [ ] Respect `prefers-reduced-motion`.

**Acceptance:** the focus screen matches the mockup; controls work by mouse and keyboard.

---

## Phase 3 — Rest screen + fullscreen takeover

- [ ] `rest.html` + `rest.ts`: pure-black "look away" screen (eye icon, copy, countdown).
- [ ] `windows.rs` (or JS `WebviewWindow`): create the `rest` window fullscreen,
      always-on-top, no decorations, no taskbar entry.
- [ ] On `FOCUS_COMPLETE`, show rest + start rest countdown; on `REST_COMPLETE`, hide it.
- [ ] Hold-`Esc`-to-skip (~2s) with the faint prompt; clicking does nothing.
- [ ] Fullscreen respects the settings toggle (windowed fallback when off).

**Acceptance:** finishing a focus block blacks out the screen with the rest prompt,
counts down, and returns to focus. Skipping requires a deliberate hold.

---

## Phase 4 — Session cycle + long rest

- [ ] Track `completedFocusBlocks`; trigger a long rest after N (default 4).
- [ ] Session dots reflect progress and reset after a long rest.
- [ ] Auto-start next block honors the auto-start setting (else land on idle "ready").

**Acceptance:** running through 4 focus blocks yields a long rest, then the set resets.

---

## Phase 5 — Settings + persistence

- [ ] Add `tauri-plugin-store`; `settings.ts` with `loadSettings`/`saveSettings` + defaults.
- [ ] Settings UI (all P0 fields from `UX_FLOWS.md`), saving immediately.
- [ ] Corrupt/missing settings fall back to defaults without crashing (FR5).
- [ ] "Reset to defaults" action.

**Acceptance:** durations and toggles persist across a full quit + relaunch; deleting or
corrupting the settings file still launches cleanly.

---

## Phase 6 — Sound, notifications, packaging → v1

- [ ] `audio.ts`: soft chime at transitions, gated on the sound setting.
- [ ] Optional native notification at transitions (`tauri-plugin-notification`).
- [ ] Tighten `capabilities/default.json` to least privilege; confirm **no** network perms.
- [ ] Verify zero network connections with a packet capture during a full cycle.
- [ ] Final `npm run tauri build`; test the installer on a clean Windows machine/VM.

**Acceptance:** installs and runs on a clean Windows 10/11 box, chimes on transitions,
persists settings, makes no network calls. **This is v1.**

---

## Phase 7 — System tray (P1)

- [ ] `tray.rs`: tray icon + menu (Show/Hide, Start/Pause, Quit); tooltip shows remaining time.
- [ ] Closing the main window minimizes to tray instead of quitting (configurable).

**Acceptance:** the app lives in the tray and is controllable from it.

---

## Phase 8 — Global shortcut + autostart (P1)

- [ ] `tauri-plugin-global-shortcut`: start/pause via a configurable hotkey; handle
      "already registered" failure gracefully.
- [ ] `tauri-plugin-autostart`: toggle in settings, off by default.
- [ ] Always-on-top toggle for the main window.

**Acceptance:** the hotkey toggles the timer from other apps; autostart works and is
off by default.

---

## Phase 9 — Polish + P2 (optional)

- [ ] Minimal daily focus-block count (local only).
- [ ] Multi-monitor blackout during rest.
- [ ] Optional 20-20-20 micro-breaks.
- [ ] Optional per-block task label; selectable chimes.

**Acceptance:** each item ships behind its own setting without complicating the default,
minimal experience.

---

## Global acceptance checklist (applies to every phase)

- [ ] Matches `PRD.md` + `UX_FLOWS.md`.
- [ ] Timer is timestamp-driven (never a naive tick counter).
- [ ] Keyboard operable; icon buttons labelled.
- [ ] No network calls; no telemetry.
- [ ] `DEVLOG.md` entry written.
