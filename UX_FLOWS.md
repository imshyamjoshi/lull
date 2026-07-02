# UX_FLOWS.md — Lull

The look and feel is the product. Match these tokens and layouts exactly.

## Design principles

- **Pitch black everywhere.** Both the focus screen and the rest screen use pure
  black `#000000`. Consistency is deliberate — the rest screen shouldn't feel like a
  different app, just a quieter state.
- **One accent.** A single soft teal marks the "active/focus" state and progress.
  Everything else is white or muted white. The rest screen uses no accent — it's calm.
- **Thin and large.** The countdown is oversized with a thin font weight. Air around it.
- **Two controls.** Pause/resume and reset. Nothing else competes for attention.

## Design tokens

```
--bg:            #000000   /* pure black — both screens */
--text:          #F4F4F2   /* primary text / digits */
--text-muted:    rgba(255,255,255,0.45)
--text-faint:    rgba(255,255,255,0.18)
--accent:        #78C8AA   /* teal — active focus + progress dots */
--hairline:      rgba(255,255,255,0.08)

font-family:     system-ui, -apple-system, "Segoe UI", sans-serif
digits:          font-weight 200, tabular-nums, ~62px
phase label:     11–12px, letter-spacing 0.22em, lowercase, muted/accent
```

Rules: no gradients, no shadows, no glows, no rounded-heavy chrome. Round control
buttons are simple 0.5px hairline circles. Respect `prefers-reduced-motion` (no
pulsing/animation for those users; crossfades become instant).

## Screen 1 — Focus timer (`index.html`)

```
┌──────────────────────────────┐
│ ·           pomodoro      ⚙  │  ← minimal title bar, draggable, settings gear
│                              │
│            focus             │  ← phase label, teal when running
│                              │
│           24:31              │  ← thin oversized digits, tabular-nums
│                              │
│         ( ‖ )   ( ⟲ )        │  ← pause/resume, reset — hairline circles
│                              │
│          ● ● ○ ○             │  ← session dots (filled = done in this set)
└──────────────────────────────┘
```

- Title bar: a small dot, centered lowercase app label, settings gear at right. The
  whole bar is a drag region (`data-tauri-drag-region`).
- Phase label: `focus` in teal while running; muted white when paused/idle.
- Digits: `MM:SS`, thin, tabular-nums so they don't jitter.
- Controls: left = pause (`ti-player-pause`) / resume (`ti-player-play`); right = reset
  (`ti-refresh`). Icon buttons need `aria-label`.
- Session dots: one per focus block in the current set (default 4). Filled teal = a
  completed focus block; faint = upcoming. Resets after a long rest.

Idle state: same layout, phase label muted, a play button in place of pause, digits
show the configured focus duration (e.g. `25:00`).

## Screen 2 — Rest / "look away" (`rest.html`)

```
┌──────────────────────────────┐
│                              │
│                              │
│             👁 (eye)          │  ← ti-eye, muted
│                              │
│          look away           │  ← thin, calm, ~26px
│   rest your eyes on something │  ← muted guidance, 2 lines
│      far away for a moment    │
│                              │
│            0:18              │  ← thin countdown, muted-bright
│                              │
└──────────────────────────────┘
```

- Pure black `#000000`, centered, no title bar, no accent color.
- Content: eye icon → `look away` → two muted lines of guidance → countdown.
- Fullscreen (when the setting is on), always-on-top, no taskbar entry.
- Copy stays gentle and non-clinical ("rest your eyes", never medical claims).
- Long rest: identical screen, longer countdown; guidance line may read "take a longer
  break — stretch and look far away."
- 20-20-20 micro-break: same screen, ~20s countdown, guidance reads "the 20-20-20
  rule — look about 20 feet away." Only appears when enabled in Settings.
- **Optional guided breathing circle** (Settings, off by default): a very faint,
  slow-pulsing radial glow centered behind the icon/text, ~8s per breath cycle,
  never uses the accent color. Fully removed (not just paused) under
  `prefers-reduced-motion: reduce`, and never shown during a micro-break. See the
  scoped exception noted in `AI_RULES.md`.

### Dismissing the rest screen (important)

The rest must be hard to *accidentally* skip, but not a trap:
- Clicking does nothing. There is no visible close button by default.
- Pressing `Esc` reveals a faint prompt: "hold Esc to skip". Holding `Esc` for ~2s
  fires `SKIP_REST` and returns to focus. A quick tap does nothing.
- When the countdown reaches 0 it auto-dismisses and moves on.

## Screen 1 addendum — home-screen timer config (iteration 2)

Focus/short-rest/long-rest durations and blocks-before-long-rest now live on the
home screen (idle only), not in Settings:
- **Preset chips**: Classic 25/5/15/4, Deep Work 50/10/20/3, Short 15/3/15/4,
  Custom (auto-highlighted when the current values match no preset).
- The big H:M:S editor sets focus duration directly, as before.
- A compact row under the controls sets short rest / long rest (minutes) and
  blocks-before-long-rest.
- A small muted line under the session dots shows today's focus-block count and
  the current day streak (local only, resets lazily at the next completed block
  after midnight).

## Screen 3 — Settings (panel or small window)

Reachable from the gear. Keep it flat and minimal (same black, same type).
Behavior toggles only — timer/cycle config lives on the home screen (above):

- Auto-start next block (toggle)
- Rest screen fullscreen (toggle)
- Sound / chime (toggle)
- Notify at transitions (toggle)
- Always on top (toggle)
- Launch on login (toggle, off by default)
- Global shortcut / Ctrl+Shift+Space (toggle, on by default)
- 20-20-20 micro-breaks (toggle, off by default)
- Breathing circle on rest (toggle, off by default)
- Reset to defaults
- P1: Always-on-top (toggle)

Changes save immediately (persisted). A "reset to defaults" link at the bottom.

## State → UI map

| Phase          | Window | Digits show     | Label (color)     | Left control |
|----------------|--------|-----------------|-------------------|--------------|
| idle           | main   | focus duration  | focus (muted)     | play         |
| focusRunning   | main   | counting down   | focus (teal)      | pause        |
| focusPaused    | main   | frozen value    | paused (muted)    | resume       |
| restRunning    | rest   | rest countdown  | look away (white) | — (hold Esc) |

## Keyboard shortcuts

| Key            | Action                    | Where        |
|----------------|---------------------------|--------------|
| Space          | pause / resume            | main window  |
| R              | reset current block       | main window  |
| Esc (hold ~2s) | skip rest                 | rest window  |
| Ctrl+Shift+Space (P1) | start / pause globally | anywhere |

## Transitions & motion

- Focus → rest: a quick fade to the black rest screen (instant if reduced-motion).
- Rest → focus: fade back to the timer.
- No bouncing, spinning, or attention-grabbing animation. Everything is quiet.

## Edge cases

- **Sleep/wake mid-block:** on resume, recompute from `targetEndAt`; if the block
  already elapsed during sleep, immediately fire the completion transition.
- **Reset during rest:** `R` in rest does nothing; only the hold-Esc skip applies.
- **Settings changed mid-block:** apply to the *next* block, not the running one
  (don't yank time out from under the user). Note this choice in `DEVLOG.md` if revisited.
- **Global shortcut already taken (P1):** registration can fail silently — detect the
  error, keep the app fully usable without it, and surface a small note in settings.
- **Multiple monitors (P2):** black out each display; until then, cover the current one.
