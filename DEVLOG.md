# DEVLOG.md — Blink (formerly "Lull")

A running log of what was built and why. **Append an entry after every phase** (and
after any notable decision). Newest entries at the top. This is the project's memory —
keep it honest and specific.

## Entry format

```
## YYYY-MM-DD — <phase or short title>

**Done:** what actually changed (files, features).
**Decisions:** choices made and the reasoning.
**Assumptions:** anything assumed to resolve ambiguity (see AI_RULES.md).
**Deps added:** new npm/crates and why (if any).
**Parking lot:** ideas noticed but deliberately not built.
**Next:** the next phase to pick up.
```

---

## 2026-07-02 — Custom presets, app icon, GitHub repo rename (follow-ups)

**Done:**
- **Save-current-as-preset**: `settings.customPresets: Preset[]` (default `[]`,
  capped at 20, each entry corrupt-safe validated like every other setting).
  Home screen now shows built-in chips + saved custom chips (with a small
  hover/focus-revealed × to delete) + a "+ Save preset" chip that opens an
  inline name field (Enter to save, Esc to cancel). `Preset` moved to
  `settings.ts` (was previously a `main.ts`-local type) so both the schema and
  the UI share one definition.
- **App icon replaced.** The shipped icon was the unmodified default Tauri
  scaffold logo (yellow/teal rings) — confirmed with the user it wasn't
  intentional. New icon: the same eye glyph already used in-app
  (`src/icons.ts`'s `eye`, seen on the rest screen), teal `#78C8AA` on black,
  regenerated at every required size via `npm run tauri icon
  src-tauri/icon-source.svg` (source SVG kept in the repo for future
  re-branding). Deleted the `android/`/`ios/` icon sets the generator also
  produces — this is a Windows-only v1 app, no mobile targets.
- **GitHub repo renamed** `lull` → `blink` via `gh repo rename`; local `origin`
  remote was updated automatically. GitHub keeps the old URL as a redirect.

**Verification:** `tsc --noEmit` clean, 40/40 tests pass, full `npm run tauri
build` succeeded with the new icon and presets code — MSI 3.26 MB / NSIS
2.14 MB, still well under the `COST.md` budget.

**Next:** still owed — human click-through of preset save/delete, and a visual
check that the new icon looks right in the taskbar/tray/title bar at real
DPI (only inspected via generated PNG files here, not a running window).

---

## 2026-07-02 — Global shortcut on/off toggle (follow-up)

**Done:** the global shortcut (`Ctrl+Shift+Space`) was always registered at
launch with no way to turn it off. Added `settings.globalShortcutEnabled`
(default **on**, preserving prior behavior) and a matching Settings toggle.
Moved shortcut registration out of Rust `.setup()` (which runs before the
frontend has loaded settings) into a new `set_global_shortcut_enabled(app,
enabled)` command, invoked from `src/main.ts` once at boot and again whenever
the toggle changes — same pattern as `applyAlwaysOnTop`/`applyLaunchOnLogin`.
The command checks `is_registered()` first so it's idempotent either way.

**Verification:** `tsc --noEmit` clean, 40/40 tests still pass (no reducer/pure-module
logic touched), `cargo check` clean.

**Next:** still owed — human verification that the toggle actually
registers/unregisters live (see `HANDOFF.md`).

---

## 2026-07-02 — Rename to Blink; home restructure; P1 finished; 3 new P2 features

User picked the app's final name and greenlit the full pending backlog from
`HANDOFF.md` in one session: rename, the home/settings restructure, and all four
candidate features (global shortcut + autostart, 20-20-20 micro-breaks, daily
stats/streak, guided breathing circle).

**Done:**
- **Renamed Lull → Blink** everywhere: `APP_NAME` (`src/config.ts`), window/event
  channel names (`blink://...`), `tauri.conf.json` (`productName`, `identifier`
  `com.shawn.blink` — settings storage path changes, acceptable pre-release),
  `Cargo.toml` (`package.name`, `lib.name` → `blink_lib`), `main.rs`, `tray.rs`
  tooltip + event, `package.json`, and the doc titles/prose in every `.md` file
  except historical `DEVLOG.md` entries (left as-is; this file's own header
  updated for clarity).
- **Home screen restructure**: preset chips (Classic 25/5/15/4, Deep Work
  50/10/20/3, Short 15/3/15/4, auto-highlighted "Custom"), plus a compact
  short-rest/long-rest/blocks-before-long-rest row, both idle-only
  (`index.html`, `src/main.ts`: `buildPresets`/`renderPresets`,
  `buildRestConfig`/`refreshRestConfig`). `buildSettingsForm` trimmed to
  behavior toggles only, per the agreed scope.
- **Global shortcut + autostart (P1, closes BUILD_PLAN Phase 8)**:
  `tauri-plugin-global-shortcut` registers a fixed `Ctrl+Shift+Space` → toggle
  start/pause, with registration failure (combo already taken) caught and
  logged rather than crashing the app (`src-tauri/src/lib.rs`).
  `tauri-plugin-autostart` backs a new "Launch on login" Settings toggle
  (`settings.launchOnLogin` — deliberately *not* named `autoStart`, which
  already means "auto-start next block"; flagged by the explore agent before
  writing any code).
- **20-20-20 micro-breaks** (`src/microbreak.ts` + wiring in `src/main.ts`): a
  pure, timestamp-driven sub-timer layered on a running focus block, tested the
  same way as `state.ts` (`src/microbreak.test.ts`, 12 cases). Every 20 real
  focus-minutes, dispatches the existing `PAUSE` event, shows a brief fullscreen
  "look ~20 ft away" prompt (reusing the rest-window infrastructure with an
  `isMicroBreak` payload flag), then auto-`RESUME`s — so it **pauses and
  extends** the block rather than eating into it. A manual resume (button,
  tray, or the hotkey) or a `RESET` ends a micro-break early and cleans up the
  window; deliberately kept out of `state.ts` so the core reducer stays pure.
- **Daily stats + streak** (`src/stats.ts`, 8 tests): local-only focus-block
  count and day streak, persisted in its own `stats.json` (same
  load/normalize/save shape as `settings.ts`, corrupt-safe per FR5). Recorded
  once per completed focus block (the `enteringRest` transition, which only
  ever follows `FOCUS_COMPLETE`). Rendered as a small muted line under the
  session dots. Note: "today" only rolls over on the next completed block, not
  at the stroke of midnight while idle — accepted as the smallest reasonable
  behavior for a v1 of this feature.
- **Guided breathing circle** (opt-in, off by default): a faint, ~8s
  radial-glow pulse behind the rest-screen content, driven by a
  `breathingCircleEnabled` payload flag on `EVT.restBegin`. Never appears
  during micro-breaks (too short to read as calm) and is fully removed (not
  merely frozen) under `prefers-reduced-motion: reduce`. This **conflicts with
  the existing `AI_RULES.md` rule** "no animation beyond a quick fade" on the
  rest screen — flagged to the user before building; they approved a scoped,
  documented exception rather than dropping the feature. `AI_RULES.md` and
  `UX_FLOWS.md` amended accordingly.
- Docs synced to match: `BUILD_PLAN.md` (Phases 7–9 checked off),
  `PRD.md` (P1 marked shipped, P2 additions, defaults table), `UX_FLOWS.md`
  (home-screen addendum, rest-screen additions, trimmed Settings field list),
  `README.md`, `CLAUDE.md`.

**Decisions:**
- Micro-breaks reuse the `PAUSE`/`RESUME` reducer events instead of adding new
  `state.ts` transitions — "pause and extend" comes for free from already-tested
  drift-free pause/resume logic, and the reducer stays pure (user's explicit
  choice over a concurrent/non-blocking alternative).
- Micro-breaks reuse the fullscreen multi-monitor rest-window plumbing rather
  than a lighter on-window banner (user's explicit choice, matching the app's
  "forces your eyes to rest" ethos).
- The global shortcut is fixed at `Ctrl+Shift+Space`, not yet user-remappable,
  even though `PRD.md` originally said "configurable" — smallest reasonable
  slice for this pass; a rebind UI is parked below.

**Assumptions:**
- Stats "today" resets lazily (see above) rather than on a background
  midnight timer — no existing pattern in the codebase for scheduled
  background work, and adding one felt like scope creep for a P1/P2 stat.
- Preset "Custom" chip is a non-interactive indicator (disabled button), not a
  fourth clickable option — there's nothing to select for "whatever the
  current values already are."

**Deps added:**
- crates: `tauri-plugin-global-shortcut = "2"`, `tauri-plugin-autostart = "2"`
  (both official Tauri plugins, per `ARCHITECTURE.md`).
- npm: `@tauri-apps/plugin-autostart@^2` (global-shortcut is Rust-side only —
  the frontend just listens for the emitted toggle event, so no JS package
  needed for it, keeping the capability surface smaller).
- `capabilities/default.json`: added `autostart:allow-enable/-disable/-is-enabled`.

**Verification:**
- `tsc --noEmit` clean; `node --test` → **40/40 pass** (12 new `microbreak.test.ts`,
  8 new `stats.test.ts`, all prior tests unchanged and still green).
- `cargo check` clean with both new plugins linked.
- **Not yet done:** `npm run tauri build` / installer size check, and all GUI
  verification (presets highlighting, rest-config row, hotkey from another app,
  autostart actually toggling the Windows registry entry, micro-break overlay
  timing, breathing circle motion + reduced-motion behavior) — this environment
  still can't observe a running window. See `HANDOFF.md`.

**Parking lot:** user-remappable global shortcut; per-block task label;
selectable chime sounds; a real midnight-boundary refresh for the stats line
while idle.

**Next:** human `npm run tauri dev` smoke test of everything in this entry, then
`npm run tauri build` to confirm installer size/name; after that, P2 leftovers
(task label, chime picker) or a shortcut-rebind UI, user's call.

---

## 2026-07-01 — Iteration 2: native redesign + fixes + tray (from user testing)

User tested the first build and directed changes. Several **override the original
`UX_FLOWS.md`/`AI_RULES.md` design** (pitch-black, hairline, frameless) — logged
here per AI_RULES; the locked docs were not edited.

**Bugs fixed:**
- **Reset button was invisible** — its icon was never rendered. Reset is now a
  labeled Fluent button (icon + "Reset").
- **Esc resized the fullscreen rest window** — the WebView's default "Esc exits
  fullscreen" now `preventDefault()`s in `rest.ts`; hold-Esc-2s still skips.

**Design pivot — native Fluent look (user chose "Follow Windows theme"):**
- Main window now uses **native decorations** (real Windows title bar with
  min/max/close), is resizable, removed the custom frameless title bar + drag
  region (and the `start-dragging` permission).
- `styles.css` rewritten to **follow the system light/dark theme**
  (`prefers-color-scheme`), Segoe UI Variable, heavier weights (digits 600, was
  200), Fluent-style buttons/switches, and the **Windows accent color** via the
  `AccentColor`/`AccentColorText` system-color keywords (with a blue fallback).
- The rest screen stays **pure black** by design (it's the calm takeaway).

**Feature — editable H:M:S on the home screen (user request):**
- Durations are now stored in **seconds** (`settings.ts`: `focusSeconds` etc.),
  supporting hours/minutes/seconds. Home screen shows an editable HH:MM:SS with
  up/down spinners + typing (idle only); countdown format is hour-aware
  (`formatClock` → `H:MM:SS` or `M:SS`). Focus duration is edited on home; rest
  durations moved to minute+second inputs in settings.

**Feature — multi-monitor blackout (user: "it should show on all screens"):**
- On rest, one fullscreen black rest window is created **per monitor**
  (`availableMonitors()`), positioned by physical coords, all showing the
  look-away content and countdown. A `rest-ready` handshake makes freshly-created
  windows reliably receive the countdown payload. Windows are closed on rest end.

**Feature — system tray + always-on-top (P1, user-selected scope):**
- `src-tauri/src/tray.rs`: tray icon + menu (Show/Hide, Start/Pause, Quit),
  left-click shows/focuses main, tooltip shows remaining time (updated from the
  frontend via a `set_tray_tooltip` command). **Close-to-tray**: the main window
  hides on close; Quit lives in the tray. Enabled the tauri `tray-icon` feature.
- **Always-on-top** toggle added to settings, applied live and on boot.
- Global shortcut + autostart were **not** selected this round (still pending P1).

**Decisions:**
- Old `*Minutes` settings keys are replaced by `*Seconds`; any previously-stored
  settings simply fall back to defaults via `normalize` (acceptable pre-release).
- Rest windows are created/destroyed each cycle (cheap at a ~25-min cadence) so
  monitor changes are always reflected.
- Capabilities widened minimally: added `create-webview-window`, `set-position`,
  `close`; scoped windows to `main` + `rest-*`; every ID re-verified against the ACL.

**Deps:** no new npm deps. Rust: enabled `tauri` feature `tray-icon` (no new crate).

**Verification:** `tsc` clean; 20/20 unit tests; `vite build` clean (main 33 KB /
8.6 KB gzip); `cargo build` (debug) links. Release installers rebuilt.
**Still needs a human:** visual check of the Fluent theme (light + dark), the
multi-monitor blackout on an actual multi-display setup, tray behavior, and the
H:M:S editor — none observable from this environment.

**Next (still pending P1):** global shortcut + autostart, if wanted.

---

## 2026-07-01 — Phases 0–6: v1 implemented (P0 complete)

Built the whole P0 app in one session. Frontend is fully green (typecheck, Vite
build, unit tests); the native layer compiles and links.

**Done:**
- **Phase 0 — Scaffold & config.** Scaffolded `vanilla-ts` create-tauri-app, then
  renamed `lull-tmp` → **Lull** across `package.json`, `Cargo.toml` (lib
  `lull_lib`), `main.rs`, and `tauri.conf.json` (`productName` Lull, identifier
  `com.shawn.lull`). Configured two windows: `main` (360×420, decorations off,
  custom draggable title bar) and `rest` (created hidden at startup; always-on-top,
  no decorations, skip-taskbar). Multi-page Vite (`index.html` + `rest.html`).
  Wired `tauri-plugin-single-instance` (second launch focuses main), `-store`,
  `-notification` in `lib.rs`. Strict local-only CSP. Least-privilege
  `capabilities/default.json` — every permission ID verified against the Tauri ACL.
- **Phase 1 — Timer core.** `state.ts` pure reducer `(state, event, cfg, now) →
  state` for START/PAUSE/RESUME/RESET/TICK/FOCUS_COMPLETE/REST_COMPLETE/SKIP_REST.
  `timer.ts` timestamp-driven (`remainingMs`, `formatMMSS`, `createTicker` on a
  250 ms `setInterval`). **18 unit tests** cover pause/resume no-drift, sleep/wake
  clamp, long-rest trigger at N, auto-start on/off, skip. All passing.
- **Phase 2 — Focus screen.** `styles.css` with the exact UX tokens (pure black,
  teal `#78C8AA`, thin 62px tabular digits, hairline controls). Title bar + gear,
  phase label, two control buttons, session dots. `aria-label`s; Space =
  pause/resume, R = reset; `prefers-reduced-motion` honored.
- **Phase 3 — Rest screen.** `rest.html`/`rest.ts` pure-black "look away" (inline
  eye icon, gentle copy, countdown). Main shows/hides the rest window and drives
  fullscreen per setting. Hold-Esc-~2s to skip (quick tap does nothing); clicking
  does nothing.
- **Phase 4 — Session cycle.** `completedFocusBlocks` tracked in the reducer; long
  rest after N (default 4); dots reflect progress and reset after a long rest;
  auto-start honored (else idle "ready").
- **Phase 5 — Settings + persistence.** `settings.ts` load/save via
  `tauri-plugin-store` with defaults + validation/clamping; corrupt/missing →
  defaults (FR5). Settings overlay (all P0 fields) saves immediately; reset-to-
  defaults. Mid-block changes apply to the next block only.
- **Phase 6 — Sound/notifications/packaging.** Chime + optional notifications;
  least-privilege capability confirmed; release installer build (MSI+NSIS) run.

**Decisions:**
- **Web Audio chime instead of a bundled `chime.wav`.** `audio.ts` synthesizes a
  soft two-note sine chime at runtime — no media asset shipped, smaller bundle,
  still fully local. Deviates from `ARCHITECTURE.md`'s `public/chime.wav`; logged
  here per AI_RULES.
- **Inline SVG icons instead of an icon font.** Avoids any font dependency/CDN
  (AI_RULES: no remote fonts). Tabler-style paths inlined in `icons.ts`.
- **No `windows.rs`.** The rest window is declared in `tauri.conf.json` (created
  hidden) and controlled from JS via `WebviewWindow`, keeping the native layer
  thin. `ARCHITECTURE.md` explicitly allowed the JS approach.
- **Tests via Node's built-in runner** (`node --test`) using native TS type
  stripping — zero test dependencies. State/timer modules kept "erasable" (no
  enums/namespaces) so they run untranspiled. Test files excluded from the app
  `tsconfig` so the browser build needs no Node types.
- App name centralized in `APP_NAME` (`config.ts`) + `productName` for easy rename.

**Assumptions:**
- Title-bar label shows the lowercased app name ("lull"); the mock's "pomodoro"
  was illustrative.
- `notify` setting added (default **off**) to satisfy Phase 6's optional
  notification while keeping it out of the default experience. Reconciles PRD
  (notifications = P1) with BUILD_PLAN Phase 6.
- Reset returns to idle at full focus duration and keeps set progress; it is a
  no-op during rest.

**Deps added:**
- npm: `@tauri-apps/plugin-store`, `@tauri-apps/plugin-notification` (persistence +
  optional alerts; both official).
- crates: `tauri-plugin-single-instance`, `tauri-plugin-store`,
  `tauri-plugin-notification` (all official Tauri plugins per ARCHITECTURE).
- Toolchain (dev machine): installed Rust stable-msvc + VS Build Tools (C++), which
  were missing. No app dependency.

**Verification:**
- `tsc --noEmit` clean; `vite build` clean (main 28 KB / 7 KB gzip, well under the
  COST budget). `node --test` → 18/18 pass. `cargo build` (debug) links OK.
- `npm run tauri build` → **MSI 3.03 MB, NSIS setup 1.94 MB, release exe 9.35 MB**
  — inside the COST targets (installer < 8 MB, installed < 15 MB).
- **Not yet visually verified:** the running window UI can't be observed from this
  environment. Needs a human `npm run tauri dev` to eyeball both screens, and a
  packet capture to confirm zero network (expected: none — no network plugins/CSP).

**Parking lot:** system tray (P1), global shortcut + autostart (P1), always-on-top
toggle (P1), daily focus count, multi-monitor blackout, 20-20-20 micro-breaks,
selectable chimes (all P2).

**Next:** Human smoke test via `tauri dev`; confirm installer artifacts; then
Phase 7 (system tray) when P0 is signed off.

---

## 0000-00-00 — Project initialized (docs)

**Done:** Authored the planning docs — `CLAUDE.md`, `PRD.md`, `ARCHITECTURE.md`,
`UX_FLOWS.md`, `BUILD_PLAN.md`, `AI_RULES.md`, `COST.md`, and this log.

**Decisions:**
- Stack locked to **Tauri v2 + vanilla TypeScript (Vite) + Rust** for a tiny, offline
  Windows binary. Rationale in `ARCHITECTURE.md`.
- Both the focus screen and the rest screen are **pure black `#000000`** for
  consistency; a single teal accent (`#78C8AA`) marks the active focus state only.
- The break **is** the rest: when focus ends, a fullscreen, always-on-top, pure-black
  "look away" screen takes over and counts down, then returns to focus.
- Rest screen defaults to **fullscreen takeover** (configurable) so it isn't trivially
  ignored; skipping requires a deliberate hold of `Esc`.
- Timer must be **timestamp-driven** for accuracy across sleep/wake.
- Placeholder app name **"Lull"** — kept in one config value for an easy rename.

**Assumptions:**
- Default cycle: 25 focus / 5 short rest / 15 long rest / long rest after 4 blocks.
- Settings changed mid-block apply to the next block, not the running one.
- v1 covers the current monitor only; multi-monitor blackout is P2.

**Deps added:** none yet (docs only).

**Parking lot:** 20-20-20 micro-breaks; per-block task labels; selectable chimes;
multi-monitor blackout; minimal daily stats. All P2, none in v1.

**Next:** Phase 0 — scaffold the Tauri app and confirm the build pipeline.
