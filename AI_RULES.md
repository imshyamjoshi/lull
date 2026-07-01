# AI_RULES.md — Lull

Hard rules for whoever (human or AI) builds this. These override convenience. When a
rule blocks you, stop and log the conflict in `DEVLOG.md` rather than working around it.

## Scope

- **Build P0 first.** Do not start P1/P2 features until every P0 acceptance criterion
  in `BUILD_PLAN.md` is met.
- **No scope creep.** If it isn't in `PRD.md`, don't build it. Ideas go in `DEVLOG.md`
  under "Parking lot", not into the app.
- **Minimalism is a feature.** When two designs work, ship the simpler one.

## Privacy & network — non-negotiable

- **Zero network calls. Ever.** No HTTP, WebSocket, fetch, telemetry, analytics, crash
  reporting, update pings, remote fonts, or CDN assets. Everything is bundled locally.
- Do **not** add the `http`, `upload`, or `websocket` Tauri plugins or any analytics SDK.
- The app must work fully offline and pass a packet capture showing no connections.
- No accounts, no cloud, no user data leaves the machine.

## Dependencies

- Prefer vanilla TypeScript and the standard library.
- Every new dependency (npm or crate) must be justified in `DEVLOG.md`. For anything
  heavy or surprising, flag it for the user before adding it.
- Use only official Tauri plugins listed in `ARCHITECTURE.md`. No unvetted third-party plugins.

## Least privilege

- `capabilities/default.json` enables only the permissions actually used by a shipped
  feature. Don't enable a permission "just in case".
- No filesystem access beyond the store plugin's own config file.

## Design fidelity

- Match `UX_FLOWS.md` tokens exactly: pure black `#000000` on both screens, single teal
  accent `#78C8AA`, thin oversized digits, tabular-nums, hairline controls.
- No gradients, drop shadows, glows, or heavy rounding. No emoji in the UI (use the
  icon font). Sentence/lowercase copy as specified — no ALL CAPS, no Title Case.
- Keep the rest screen calm: no accent color, no animation beyond a quick fade.

## Correctness

- The countdown is **timestamp-driven**. Compute remaining time from a target end
  timestamp; never decrement a counter per tick. This is a correctness requirement, not
  a preference — a tick counter drifts and breaks across sleep/wake.
- State transitions are pure functions in `state.ts`. Side effects live in the callers.
- Missing/corrupt settings must fall back to defaults without crashing (FR5).

## Accessibility

- Everything reachable and operable by keyboard.
- Icon-only buttons have `aria-label`. Sufficient contrast on the black background.
- Respect `prefers-reduced-motion` (no pulsing; transitions become instant).
- Copy about eyes/rest stays gentle and non-clinical. No medical claims.

## Code style

- TypeScript `strict: true`. Small, single-purpose modules matching the layout in
  `ARCHITECTURE.md`.
- Rust: keep the native layer thin (windows, tray, shortcuts, autostart, persistence).
- No dead code, no commented-out blocks left behind, no `console.log` spam in shipped code.

## Testing

- Unit-test the timer engine and state transitions (pause/resume accuracy, sleep/wake,
  long-rest trigger).
- Keep a short manual test checklist per phase in the PR/commit description.

## Git & logging

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- One `BUILD_PLAN.md` phase per focused set of commits.
- **Append a `DEVLOG.md` entry after every phase** — what changed, why, decisions,
  assumptions, and anything parked. This is mandatory.
- Do **not** edit `PRD.md`, `ARCHITECTURE.md`, `UX_FLOWS.md`, or this file without
  recording the rationale in `DEVLOG.md` and flagging it for the user.

## Handling ambiguity

- If a spec is unclear, make the **smallest reasonable assumption**, implement it, and
  log the assumption in `DEVLOG.md`. Don't stall, and don't invent large features to
  resolve a small gap.

## Security

- No `eval`, no dynamic remote code, no loading remote URLs into any webview.
- Keep the WebView to bundled local content only.
