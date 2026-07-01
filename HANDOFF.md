# HANDOFF — Lull (pick up here)

Written 2026-07-01 at end of session. This is the running to-do so work can
continue tomorrow (the user will use Claude chat, not Claude Code, so this file
must be self-explanatory). Newest context at top. Also read `DEVLOG.md` for the
full history and `CLAUDE.md`/`PRD.md`/`UX_FLOWS.md`/`AI_RULES.md` for the rules.

## Where things stand

- **P0 (v1) is complete and shipped**: focus/rest Pomodoro loop, fullscreen
  black "look away" rest takeover, session cycle + long rest, persisted settings,
  transition chime. Installers build (MSI + NSIS).
- **Iteration 2 is done and pushed** (commit `f1ef6a7`): native Fluent look that
  follows the Windows light/dark theme, real title bar, heavier text, Windows
  accent color; editable HH:MM:SS on the home screen; multi-monitor rest blackout
  (one black window per monitor); system tray (Show/Hide, Start/Pause, Quit,
  tooltip, close-to-tray); always-on-top toggle.
- **Repo**: https://github.com/imshyamjoshi/lull (main). Build/test commands and
  file layout are in `README.md`.
- Toolchain installed on this machine: Rust stable-msvc + VS Build Tools, Node.

## Just fixed (in the latest commit made at end of session)

- **Home-screen time arrows didn't repaint the box.** The refresh guard in
  `src/main.ts` (`refreshEditor`) skipped updates whenever anything in the editor
  had focus — including the arrow buttons. Now it only skips while a value field
  is actively being *typed* in. Verify this works when you next run it.

## PENDING — do these next

### 1. Home restructure (user-requested, agreed scope — just needs building)
Goal: **all Pomodoro/timer configuration lives on the home screen; Settings holds
only app-behavior toggles.**
- Add **preset chips** on the home screen to quick-select a cycle. Suggested
  presets (each sets focus / short rest / long rest / blocks-before-long):
  - Classic 25 / 5 / 15 / 4
  - Deep Work 50 / 10 / 20 / 3
  - Short 15 / 3 / 15 / 4
  - Custom (auto-selected when values match no preset)
  Highlight the active preset; editing any duration switches to "Custom".
- **Move OUT of Settings and onto the home screen** (visible when idle): short
  rest, long rest, and "blocks before long rest" — e.g., a compact editable row
  under the session dots. Focus duration is already the big HH:MM:SS editor.
- **Settings should then contain only**: auto-start next block, rest screen
  fullscreen, sound, notify at transitions, always on top, + "reset to defaults".
- Files: `index.html` (add presets + rest-config row), `src/main.ts`
  (`buildSettingsForm` → strip timer fields; add preset rendering + rest editors),
  `src/styles.css` (chip styles). Settings model in `src/settings.ts` already
  stores everything in **seconds** — no schema change needed.

### 2. Rename the app (name not chosen yet)
"Lull" is a placeholder the user dislikes. Candidates suggested: **Horizon,
Blink, Eclipse, Respite** (user may pick another). Once chosen, change it in:
- `src/config.ts` → `APP_NAME`
- `src-tauri/tauri.conf.json` → `productName`, `identifier` (e.g.
  `com.shawn.<name>`), and the `main` window `title`
- `src-tauri/Cargo.toml` → `package.name` and `lib.name` (`<name>_lib`)
- `src-tauri/src/main.rs` → `<name>_lib::run()`
- `README.md` heading, and tray tooltip default "Lull" in `src/main.ts` /
  `src-tauri/src/tray.rs`
Note: changing `identifier` changes the settings storage path, so old saved
settings won't carry over (fine pre-release).

### 3. New features the user is considering (pick before building)
Suggested list (all local/offline, no network per AI_RULES):
- **20-20-20 micro-breaks** — every ~20 min of focus, a brief "look ~20 ft away
  for 20 s" prompt layered on the cycle. Most on-brand for eye health.
- **Daily stats & streak** — local count of focus blocks/time today + day streak.
- **Guided breathing on the rest screen** — optional slow expand/contract circle.
- **Finish P1: global shortcut (Ctrl+Shift+Space) + autostart on login** — the
  remaining P1 items (plugins already noted in `ARCHITECTURE.md`:
  `tauri-plugin-global-shortcut`, `tauri-plugin-autostart`).
Other ideas parked: per-block task label, selectable chime sounds, gradual
screen dim before a break, accent/theme override.

### 4. Still-pending P1 (from BUILD_PLAN.md)
- Global shortcut + autostart (see above). Always-on-top and tray are DONE.

## MANUAL VERIFICATION still owed (can't be done without a real display)
The assistant could not see the GUI/monitors. A human must confirm:
- The Fluent theme in **both** Windows light and dark modes.
- **Reset button** visible; the time **arrows now update the box** (just fixed).
- `Esc` on the rest screen does NOT exit fullscreen; **hold Esc ~2s** skips.
- The rest screen **blacks out every monitor** on a multi-display setup.
- Tray icon + right-click menu; close-to-tray (X hides, Quit exits).
- No network connections during a full cycle (packet capture / Get-NetTCPConnection).

## How to build / test
```
npm install
npm test               # 20 unit tests (timer + state), Node's built-in runner
npm run typecheck
npm run tauri dev      # run the app
npm run tauri build    # installers in src-tauri/target/release/bundle
```

## Open questions for the user (answer to unblock)
1. Final app name?
2. Which of the features in section 3 to build (and how many)?
3. Confirm the home/settings split in section 1 is exactly what you want.
