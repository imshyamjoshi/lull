// Boots the rest ("look away") window. Purely presentational: it renders the
// countdown it is told about and offers a deliberate hold-Esc skip. All timing
// authority stays in the main window — this window never decides completion.

import { emit, listen } from "@tauri-apps/api/event";
import { EVT, TICK_MS, REST_SKIP_HOLD_MS } from "./config.ts";
import { icons } from "./icons.ts";
import { byId, setText, toggleClass } from "./dom.ts";
import { createTicker, formatMMSS, remainingMs } from "./timer.ts";

const iconEl = byId("icon");
const guideEl = byId("guide");
const digitsEl = byId("digits");
const skipEl = byId("skip");

iconEl.innerHTML = icons.eye;

const SHORT_GUIDE = "rest your eyes on something<br />far away for a moment";
const LONG_GUIDE = "take a longer break —<br />stretch and look far away";

let endAt = 0;

const ticker = createTicker(() => {
  setText(digitsEl, formatMMSS(remainingMs(endAt, Date.now())));
}, TICK_MS);

interface RestBegin {
  isLongRest: boolean;
  endAt: number;
}

void listen<RestBegin>(EVT.restBegin, (e) => {
  endAt = e.payload.endAt;
  guideEl.innerHTML = e.payload.isLongRest ? LONG_GUIDE : SHORT_GUIDE;
  setText(digitsEl, formatMMSS(remainingMs(endAt, Date.now())));
  toggleClass(skipEl, "is-visible", false);
  if (!ticker.running) ticker.start();
});

// ---- hold-Esc to skip ----
// A quick tap does nothing; holding Esc for ~2s reveals intent and skips.

let holdTimer: ReturnType<typeof setTimeout> | null = null;

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  toggleClass(skipEl, "is-visible", true);
  if (holdTimer === null) {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      void emit(EVT.restSkip);
    }, REST_SKIP_HOLD_MS);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key !== "Escape") return;
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  setTimeout(() => toggleClass(skipEl, "is-visible", false), 600);
});
