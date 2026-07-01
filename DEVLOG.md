# DEVLOG.md — Lull

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
