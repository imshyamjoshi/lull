# PRD.md — Blink

## Problem

Focus timers keep you working, but they do nothing for your eyes. Staring at a
screen for hours causes eye strain and fatigue. Blink ties every break to a
deliberate, hard-to-ignore eye rest: when a focus block ends, the screen goes
pure black and tells you to look away from the screen for a few minutes.

## Goals

- A dead-simple Pomodoro loop: focus → rest → focus, with sensible defaults.
- Make the rest **actually happen** by taking over the screen with a black "look away" prompt.
- Feel calm and minimal: pure black, one accent color, thin type, almost no chrome.
- Be completely offline, private, and free to run.

## Non-goals

- No accounts, login, cloud sync, or leaderboards.
- No analytics, telemetry, crash reporting, or any network calls. (See `AI_RULES.md`.)
- No mobile, no web version. Windows desktop only for v1.
- No task manager, no calendar, no notes. It is a timer, not a productivity suite.
- No heavy theming. Pitch black **is** the design.

## Target user

Someone who works long hours at a screen and wants a distraction-free timer that
also protects their eyes — without configuring 20 things or trusting a cloud app.

## The core loop

```
IDLE ──▶ FOCUS (25:00) ──▶ REST (5:00, black "look away") ──▶ FOCUS ──▶ …
                                   │
                     every 4th rest is a LONG REST (15:00)
```

## Features

### P0 — must ship (v1)

- **Focus timer** with a large, thin countdown (default 25:00).
- **Two controls only**: pause/resume and reset. Plus a settings entry.
- **Automatic rest screen**: when focus hits 0, the app shows a **full-screen,
  pure-black rest screen** with an eye icon, the words "look away", a short line of
  guidance, and its own countdown.
- **Rest = the break.** Short rest default 5:00; long rest default 15:00 after every
  4th focus block.
- **Auto-return**: when the rest countdown ends, return to the next focus block.
- **Session progress**: up to 4 small dots showing position in the current set.
- **Settings** (persisted): focus / short-rest / long-rest durations, focus blocks
  before a long rest, auto-start next block on/off, rest screen fullscreen on/off,
  sound on/off.
- **Persistence**: settings survive quit + relaunch.
- **Chime** at each transition (optional, toggle in settings).
- **Keyboard**: `Space` = pause/resume, `R` = reset. On the rest screen, skipping
  requires intent (see `UX_FLOWS.md` — hold `Esc`).
- **Pure-black UI** on both screens with a single teal accent and thin digits, exactly
  as specified in `UX_FLOWS.md`.

### P1 — soon after v1 (all shipped)

- **System tray**: icon in the notification area; menu with Show/Hide, Start/Pause,
  Quit; tray tooltip shows remaining time. ✅
- **Global shortcut** to start/pause from any app (`Ctrl+Shift+Space`). ✅
  On/off toggle in Settings (default on); the combo itself is fixed for now,
  not yet user-remappable — see `HANDOFF.md`.
- **Autostart on login** ("Launch on login" toggle in Settings, off by default). ✅
- **Always-on-top** toggle for the timer window. ✅
- **Native notification** at transitions (optional, alongside or instead of the chime). ✅
- **Minimal daily stat**: number of focus blocks completed today, plus a day streak
  (local only, `src/stats.ts`). ✅

### P2 — future / nice to have

- Optional 20-20-20 micro-breaks (every 20 min, look ~20 ft away for 20 s) layered
  on top, pausing/extending the current focus block. ✅ Off by default.
- Optional guided breathing circle on the rest screen (off by default; a scoped,
  documented exception to the "no rest-screen animation" rule — see `AI_RULES.md`). ✅
- Multi-monitor takeover (black out every display during rest). ✅
- Optional per-block task label.
- A couple of chime sounds to choose from.

## Functional requirements

- **FR1** Timer counts down accurately even if the machine sleeps/wakes mid-block;
  compute remaining time from a target end timestamp, not by counting ticks.
- **FR2** Reaching 0 on focus transitions to rest with no user action.
- **FR3** The rest screen is pure black `#000000`, covers the screen (when fullscreen
  is on), and is hard to dismiss accidentally.
- **FR4** Long rest triggers after N completed focus blocks (N = configurable, default 4).
- **FR5** All settings load on launch and are written on change; corrupt/missing
  settings fall back to defaults without crashing.
- **FR6** No outbound network request is ever made. The app functions fully offline.
- **FR7** Auto-start toggle: when on, the next block starts automatically; when off,
  the app waits in a "ready" state for the user to press start.

## Defaults

| Setting                     | Default |
|-----------------------------|---------|
| Focus duration              | 25:00   |
| Short rest                  | 05:00   |
| Long rest                   | 15:00   |
| Focus blocks before long rest | 4     |
| Auto-start next block       | on      |
| Rest screen fullscreen      | on      |
| Sound / chime               | on      |
| Notify at transitions       | off     |
| Always on top                | off    |
| Launch on login (P1)        | off     |
| Global shortcut (P1)        | on, Ctrl+Shift+Space (fixed combo) |
| 20-20-20 micro-breaks (P2)  | off     |
| Breathing circle on rest (P2) | off   |

## Success criteria

- From a cold install, a first-time user can start a focus block within ~5 seconds
  and understand the rest screen with no explanation.
- The rest screen makes people look away — it is not trivially clicked past.
- Idle CPU ≈ 0%, bundle < 15 MB, cold start feels instant (see `COST.md`).
- Zero network connections observed in a packet capture during normal use.

## Sensitive-topic note

This app touches on eye health and screen fatigue in a general wellbeing sense only.
It is not medical advice and should not claim to prevent or treat any condition. Keep
copy gentle and non-clinical ("rest your eyes", not "prevents eye disease").
