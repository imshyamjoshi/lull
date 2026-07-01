# COST.md — Lull

## Runtime cost: $0

Lull is a fully local, offline desktop app. It has **no ongoing cost**:

- No servers, no backend, no cloud.
- No paid APIs or third-party services.
- No subscriptions, no accounts.
- No telemetry or data egress (see `AI_RULES.md`).

It runs entirely on the user's machine and never phones home. There is nothing to bill.

## Resource budget (targets)

Treat these as targets to design against, not hard failures. If a target can't be met,
note why in `DEVLOG.md`.

| Metric              | Target                 |
|---------------------|------------------------|
| Installer size      | < 8 MB                 |
| Installed footprint | < 15 MB                |
| Idle RAM            | < 80 MB                |
| Idle CPU            | ~0% (a light interval; no busy loop) |
| Cold start          | Feels instant (< ~1s)  |
| Network connections | 0                      |

These are realistic for Tauri v2 on Windows because the app reuses the OS WebView2
runtime instead of bundling a browser. Keeping the frontend vanilla (no framework)
protects the bundle size.

## Build-time cost (one-time, for the developer)

All free and open source:

- Rust toolchain (rustup) — free.
- Node.js 20 LTS — free.
- VS Code (or any editor) — free.
- WebView2 runtime — free, preinstalled on Windows 11.

Optional, only if distributing widely:

- **Code signing certificate** — a self-signed cert is free (users see a SmartScreen
  warning). A trusted OV/EV certificate to avoid warnings is a paid, optional expense
  and is **not required** for personal use. Decide later; not needed to build or run v1.

## Distribution cost: $0

Ship via GitHub Releases (free). No app store fees required for v1.

## Rough build effort (for planning only)

Very rough guidance for building with Claude Code, in phase order from `BUILD_PLAN.md`.
Actual time varies; these are order-of-magnitude, not commitments.

| Phase | Work                              | Rough effort |
|-------|-----------------------------------|--------------|
| 0     | Scaffold + build pipeline         | small        |
| 1     | Timer core + tests                | medium       |
| 2     | Focus screen UI                   | medium       |
| 3     | Rest screen + fullscreen takeover | medium       |
| 4     | Session cycle + long rest         | small        |
| 5     | Settings + persistence            | medium       |
| 6     | Sound, notifications, packaging   | medium       |
| 7–8   | Tray, global shortcut, autostart (P1) | medium   |
| 9     | Polish + P2                       | as desired   |

v1 = phases 0–6. Everything after is optional and additive.

## The cost contract

If any change would introduce a runtime cost — a network call, a paid service, an
account system, telemetry — it is **out of scope** and must be rejected or escalated to
the user first. Lull staying free-to-run and private is a core requirement, not a
default that can drift.
