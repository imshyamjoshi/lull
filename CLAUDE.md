# CLAUDE.md — read this first

You are building **Blink**: a minimal, pitch-black Pomodoro timer for Windows that
forces your eyes to rest between focus blocks. When a focus block ends, the app
takes over the screen with a pure-black "look away" rest screen and a countdown,
then returns to the next focus block.

> The app name is centralized in `APP_NAME` (`src/config.ts`) and `productName`
> (`src-tauri/tauri.conf.json`) so a future rename stays a one-line-ish change.

## Read order

Read these before writing any code. They are the source of truth.

1. `PRD.md` — what we are building and why (scope, features, requirements).
2. `UX_FLOWS.md` — every screen, state, transition, and the exact design tokens.
3. `ARCHITECTURE.md` — stack, project layout, windows, plugins, data model.
4. `AI_RULES.md` — hard rules and guardrails. Non-negotiable.
5. `BUILD_PLAN.md` — the phased plan you execute, with acceptance criteria.
6. `COST.md` — the resource budget and the "this app costs $0 to run" contract.
7. `DEVLOG.md` — append an entry after **every** phase. Never skip this.

## Stack (locked)

- **Tauri v2** (stable) — tiny native Windows binary, web frontend.
- **Vanilla TypeScript + Vite** (the `vanilla-ts` create-tauri-app template). No UI framework.
- **Rust** only for windowing, tray, global shortcuts, autostart, persistence.
- Target: **Windows 10/11 x64**. WebView2 is the runtime (preinstalled on Win 11).

Rationale lives in `ARCHITECTURE.md`. Do not switch stacks without an `AI_RULES.md`
exception and a `DEVLOG.md` entry.

## Quickstart

```bash
# prerequisites: Rust (rustup, stable), Node.js 20 LTS+, VS Code
npm create tauri-app@latest blink -- --template vanilla-ts
cd blink
npm install
npm run tauri dev      # run in dev
npm run tauri build    # produce MSI + NSIS installer in src-tauri/target/release/bundle
```

## Definition of done (per feature)

A feature is done when:
- It matches `PRD.md` requirements and `UX_FLOWS.md` visuals **exactly**.
- The timer is **timestamp-driven** (see `AI_RULES.md`) — never a naive tick counter.
- It works after a full quit + relaunch (settings persist).
- Keyboard operable; icon buttons have `aria-label`.
- No network calls. No telemetry. Verified against `AI_RULES.md`.
- `DEVLOG.md` has an entry describing what changed and any decisions made.

## Conventions (summary — full rules in AI_RULES.md)

- TypeScript `strict: true`. Small, single-purpose modules.
- State transitions are **pure functions** over a single state enum (`state.ts`).
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- One `BUILD_PLAN.md` phase ≈ one focused commit set. Update `DEVLOG.md` when you finish it.
- When something is ambiguous: make the smallest reasonable assumption, log it in
  `DEVLOG.md`, and keep going. Don't stall.

## The one-sentence spec

A distraction-free, offline, pure-black Pomodoro timer whose breaks are a full-screen
"look away and rest your eyes" prompt.
