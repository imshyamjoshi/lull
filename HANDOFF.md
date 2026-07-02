# HANDOFF — Blink (pick up here)

Written 2026-07-02 at end of session. This is the running to-do so work can
continue later (the user may use Claude chat, not Claude Code, so this file
must be self-explanatory). Newest context at top. Also read `DEVLOG.md` for the
full history and `CLAUDE.md`/`PRD.md`/`UX_FLOWS.md`/`AI_RULES.md` for the rules.

## Where things stand

- **App renamed Lull → Blink.** Centralized in `APP_NAME` (`src/config.ts`) and
  `productName`/`identifier` (`src-tauri/tauri.conf.json`, now
  `com.shawn.blink`). Old saved settings won't carry over — expected, pre-release.
- **P0 (v1) and P1 are both fully shipped**: focus/rest Pomodoro loop, fullscreen
  black "look away" rest takeover (multi-monitor), session cycle + long rest,
  persisted settings, transition chime, native Fluent theme, system tray,
  always-on-top, **global shortcut (`Ctrl+Shift+Space`, fixed combo, with its
  own on/off toggle in Settings — default on)**, and **autostart-on-login**
  ("Launch on login" toggle in Settings).
- **Home screen restructured**: preset chips (Classic/Deep Work/Short/Custom),
  a compact short-rest/long-rest/blocks row, and a daily
  focus-count-+-streak line all live on the idle home screen now. Settings
  holds only behavior toggles + "Reset to defaults".
- **Three P2 features shipped, all off by default**: 20-20-20 micro-breaks
  (`src/microbreak.ts`), daily stats/streak (`src/stats.ts`), and an opt-in
  guided breathing circle on the rest screen (a documented, scoped exception to
  the "no rest-screen animation" rule in `AI_RULES.md`).
- **Save-current-as-preset**: home screen presets now include user-saved
  custom presets (`settings.customPresets`), addable via a "+ Save preset"
  chip and deletable via a hover/focus-revealed × on each custom chip.
- **App icon replaced**: was the unmodified default Tauri scaffold logo; now a
  teal eye glyph on black matching the in-app icon (`src-tauri/icon-source.svg`
  is the source of truth — regenerate with `npm run tauri icon
  src-tauri/icon-source.svg`, then delete the `android/`/`ios/` folders it
  also produces, since this is Windows-only).
- **Repo**: https://github.com/imshyamjoshi/blink (main) — renamed from `lull`
  this session via `gh repo rename`; GitHub keeps the old URL as a redirect,
  local `origin` remote already points at the new URL.
- Toolchain on this machine: Rust stable-msvc + VS Build Tools, Node — but
  `cargo`/`rustc` aren't on PATH in this shell; invoke via
  `"$env:USERPROFILE\.cargo\bin\cargo.exe"` in PowerShell.

## MANUAL VERIFICATION owed (this environment can't see a running window/GUI)

Full checklist for a human `npm run tauri dev` pass:
- [ ] Preset chips: clicking one sets all 4 values and highlights correctly;
  editing any value away from a preset switches the highlight to "Custom".
- [ ] "+ Save preset": save current values under a name, confirm the new chip
  appears and applies correctly; delete it via the × and confirm it's gone
  and `customPresets` no longer has it after a restart.
- [ ] New app icon shows correctly in the taskbar, title bar, tray, and Alt-Tab
  switcher at real screen DPI (only checked as generated PNG files so far).
- [ ] Rest-config row (short/long rest, blocks) on the home screen persists
  and updates the session dots count live.
- [ ] Settings panel now shows only toggles (no duration fields) — confirm
  nothing got orphaned/broken in the panel layout.
- [ ] `Ctrl+Shift+Space` toggles start/pause **from another app** (not focused
  on Blink) while the "Global shortcut" Settings toggle is on. Also confirm
  the app still launches fine if that combo is already taken by something
  else (should log to stderr, not crash).
- [ ] Turning the "Global shortcut" toggle off actually unregisters it
  (pressing the combo afterward should do nothing); turning it back on
  re-registers it without needing a restart.
- [ ] "Launch on login" toggle actually adds/removes Blink from Windows
  startup (check `shell:startup` or Task Manager > Startup apps) — this is the
  one item that plausibly needs a real Windows session, not just a VM/CI box.
- [ ] 20-20-20: enable in Settings, let a focus block run ~20 min (or
  temporarily shrink `MICRO_BREAK_INTERVAL_MS` in `src/config.ts` to test
  faster), confirm a brief fullscreen "look ~20 ft away" prompt appears, the
  main focus countdown visibly pauses during it, and resumes correctly after
  ~20s. Also test: manually resuming early ends it cleanly; `Reset` during one
  doesn't leave an orphaned black window.
- [ ] Daily stats line shows under the session dots and increments after a
  completed focus block; streak text only shows once `streakDays > 0`.
- [ ] Breathing circle: enable in Settings, confirm a faint pulsing glow on the
  rest screen (short/long rest, not micro-breaks), confirm it's fully absent
  when Windows "reduce motion" is on.
- [ ] Tray, close-to-tray, hold-Esc-to-skip, multi-monitor blackout — all
  previously verified-pending items from before this session, still open.
- [ ] `npm run tauri build` — confirm it still produces MSI + NSIS installers
  under the new name/identifier and check the size is still within `COST.md`
  budgets (was 3.03 MB MSI / 1.94 MB NSIS before this session's additions).
- [ ] Packet capture / `Get-NetTCPConnection` during a full cycle — still
  expected zero, but re-confirm after adding two new plugins.

## PENDING — nice-to-haves, none blocking

1. **User-remappable global shortcut.** Currently fixed at `Ctrl+Shift+Space`
   in `src-tauri/src/lib.rs`. `PRD.md` originally said "configurable"; this
   session shipped the fixed version as the smallest reasonable slice. A
   rebind UI would need: a capture-field in Settings, JS-side
   `@tauri-apps/plugin-global-shortcut` (not currently a dependency — only the
   Rust crate is used today), unregister-then-reregister logic, and
   persisting the chosen combo in `settings.ts`.
2. **Stats midnight rollover while idle.** `src/stats.ts`'s "today" only
   resets the next time a focus block completes, not exactly at midnight if
   the app sits idle overnight. Documented as an accepted assumption in
   `DEVLOG.md`; revisit if it bothers the user in practice.
3. **Leftover P2 ideas** (never started): per-block task label, a couple of
   selectable chime sounds.
4. **GitHub repo rename** (`lull` → `blink`) — cosmetic, low priority, ask
   before doing it since it changes the remote clone URL.

## How to build / test

```
npm install
npm test               # 40 unit tests (timer, state, microbreak, stats), Node's built-in runner
npm run typecheck
npm run tauri dev      # run the app
npm run tauri build    # installers in src-tauri/target/release/bundle
```

If `cargo`/`tauri` CLI aren't found in a fresh shell, they're at
`%USERPROFILE%\.cargo\bin\` — either add that to PATH or invoke directly.
