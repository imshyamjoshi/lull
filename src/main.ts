// Boots the main timer window: owns the state machine, the render loop, and the
// side effects (chime, notifications, showing/hiding the rest window).

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { APP_NAME, TICK_MS, EVT } from "./config.ts";
import { icons } from "./icons.ts";
import { byId, setText, toggleClass } from "./dom.ts";
import { createTicker, formatMMSS } from "./timer.ts";
import { reduce, initialState, type AppState, type AppEvent, type TimerConfig } from "./state.ts";
import {
  loadSettings,
  saveSettings,
  normalize,
  toTimerConfig,
  DEFAULT_SETTINGS,
  type Settings,
} from "./settings.ts";
import { playChime } from "./audio.ts";

// ---- elements ----
const el = {
  appLabel: byId("appLabel"),
  phase: byId("phase"),
  digits: byId("digits"),
  primary: byId<HTMLButtonElement>("primary"),
  reset: byId<HTMLButtonElement>("reset"),
  dots: byId("dots"),
  gear: byId<HTMLButtonElement>("gear"),
  settings: byId("settings"),
  settingsList: byId("settingsList"),
  settingsClose: byId<HTMLButtonElement>("settingsClose"),
  resetDefaults: byId<HTMLButtonElement>("resetDefaults"),
};

// ---- app state ----
let settings: Settings = { ...DEFAULT_SETTINGS };
let cfg: TimerConfig = toTimerConfig(settings);
let state: AppState = initialState(cfg);
let settingsOpen = false;
let notifyGranted = false;

const ticker = createTicker(onTick, TICK_MS);

// ---- dispatch + effects ----

/** Apply an event to state and run any phase-change side effects (no render). */
function apply(event: AppEvent): void {
  const prev = state;
  state = reduce(prev, event, cfg, Date.now());
  handleTransition(prev.phase, state.phase);
}

function dispatch(event: AppEvent): void {
  apply(event);
  render();
}

function handleTransition(prevPhase: AppState["phase"], nextPhase: AppState["phase"]): void {
  const enteringRest = prevPhase !== "restRunning" && nextPhase === "restRunning";
  const leavingRest = prevPhase === "restRunning" && nextPhase !== "restRunning";

  if (enteringRest) {
    playChime(settings.sound);
    maybeNotify("time to rest", "look away and rest your eyes.");
    void showRestWindow(state.isLongRest, state.targetEndAt ?? Date.now());
  } else if (leavingRest) {
    playChime(settings.sound);
    void hideRestWindow();
    if (nextPhase === "focusRunning") maybeNotify("back to focus", "your break is over.");
  }
}

function onTick(now: number): void {
  apply({ type: "TICK", now });
  renderDigits();
  if (state.phase === "focusRunning" && state.msRemaining <= 0) {
    dispatch({ type: "FOCUS_COMPLETE" });
  } else if (state.phase === "restRunning" && state.msRemaining <= 0) {
    dispatch({ type: "REST_COMPLETE" });
  }
}

// ---- rest window control ----

async function showRestWindow(isLongRest: boolean, endAt: number): Promise<void> {
  const rest = await WebviewWindow.getByLabel("rest");
  if (!rest) return;
  try {
    await rest.setFullscreen(settings.fullscreenRest);
    if (!settings.fullscreenRest) {
      await rest.setSize(new LogicalSize(520, 380));
      await rest.center();
    }
    await rest.setAlwaysOnTop(true);
    await rest.show();
    await rest.setFocus();
    await emit(EVT.restBegin, { isLongRest, endAt });
  } catch {
    // If the window can't be shown, the main-window timer still advances.
  }
}

async function hideRestWindow(): Promise<void> {
  const rest = await WebviewWindow.getByLabel("rest");
  if (!rest) return;
  try {
    await rest.hide();
    await rest.setFullscreen(false);
  } catch {
    /* noop */
  }
}

// ---- notifications (optional, default off) ----

async function ensureNotifyPermission(): Promise<void> {
  if (!settings.notify) return;
  try {
    notifyGranted = await isPermissionGranted();
    if (!notifyGranted) notifyGranted = (await requestPermission()) === "granted";
  } catch {
    notifyGranted = false;
  }
}

function maybeNotify(title: string, body: string): void {
  if (!settings.notify || !notifyGranted) return;
  try {
    sendNotification({ title, body });
  } catch {
    /* noop */
  }
}

// ---- rendering ----

const PHASE_LABEL: Record<AppState["phase"], string> = {
  idle: "focus",
  focusRunning: "focus",
  focusPaused: "paused",
  restRunning: "resting",
};

function render(): void {
  renderPhase();
  renderDigits();
  renderControls();
  renderDots();
}

function renderPhase(): void {
  setText(el.phase, PHASE_LABEL[state.phase]);
  toggleClass(el.phase, "is-active", state.phase === "focusRunning");
}

function renderDigits(): void {
  setText(el.digits, formatMMSS(state.msRemaining));
}

let lastPrimaryLabel = "";
function renderControls(): void {
  let icon = icons.play;
  let label = "Start";
  let primaryDisabled = false;

  switch (state.phase) {
    case "idle":
      icon = icons.play;
      label = "Start";
      break;
    case "focusRunning":
      icon = icons.pause;
      label = "Pause";
      break;
    case "focusPaused":
      icon = icons.play;
      label = "Resume";
      break;
    case "restRunning":
      icon = icons.pause;
      label = "Pause";
      primaryDisabled = true;
      break;
  }

  // Only touch innerHTML when the icon/label actually changed.
  if (label !== lastPrimaryLabel) {
    el.primary.innerHTML = icon;
    el.primary.setAttribute("aria-label", label);
    lastPrimaryLabel = label;
  }
  el.primary.disabled = primaryDisabled;
  el.reset.disabled = state.phase === "idle" || state.phase === "restRunning";
}

function renderDots(): void {
  const n = Math.max(1, cfg.blocksBeforeLongRest);
  if (el.dots.childElementCount !== n) {
    el.dots.replaceChildren();
    for (let i = 0; i < n; i++) {
      const d = document.createElement("span");
      d.className = "dot";
      el.dots.appendChild(d);
    }
  }
  const done = Math.min(state.completedFocusBlocks, n);
  el.dots.querySelectorAll<HTMLElement>(".dot").forEach((dot, i) => {
    toggleClass(dot, "is-done", i < done);
  });
}

// ---- controls / keyboard ----

function primaryAction(): void {
  switch (state.phase) {
    case "idle":
      dispatch({ type: "START" });
      break;
    case "focusRunning":
      dispatch({ type: "PAUSE" });
      break;
    case "focusPaused":
      dispatch({ type: "RESUME" });
      break;
    case "restRunning":
      break;
  }
}

function wireControls(): void {
  el.gear.innerHTML = icons.settings;
  el.primary.addEventListener("click", primaryAction);
  el.reset.addEventListener("click", () => dispatch({ type: "RESET" }));
  el.gear.addEventListener("click", openSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.resetDefaults.addEventListener("click", () => void applySettings(DEFAULT_SETTINGS));
}

function wireKeyboard(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOpen) {
      closeSettings();
      return;
    }
    if (settingsOpen) return;
    const target = e.target as HTMLElement | null;
    const onInput = target?.tagName === "INPUT";
    const onButton = target?.tagName === "BUTTON";
    if (onInput) return;

    if (e.code === "Space") {
      // A focused button already activates on Space; don't double-fire.
      if (onButton) return;
      e.preventDefault();
      primaryAction();
    } else if (e.key.toLowerCase() === "r") {
      dispatch({ type: "RESET" });
    }
  });
}

// ---- settings panel ----

const NUMBER_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "focusMinutes", label: "focus (min)" },
  { key: "shortRestMinutes", label: "short rest (min)" },
  { key: "longRestMinutes", label: "long rest (min)" },
  { key: "blocksBeforeLongRest", label: "blocks before long rest" },
];

const TOGGLE_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "autoStart", label: "auto-start next block" },
  { key: "fullscreenRest", label: "rest screen fullscreen" },
  { key: "sound", label: "sound" },
  { key: "notify", label: "notify at transitions" },
];

const numberInputs = new Map<keyof Settings, HTMLInputElement>();
const toggleButtons = new Map<keyof Settings, HTMLButtonElement>();

function buildSettingsForm(): void {
  el.settingsList.replaceChildren();

  for (const f of NUMBER_FIELDS) {
    const row = document.createElement("div");
    row.className = "field";
    const id = `set-${f.key}`;

    const label = document.createElement("label");
    label.textContent = f.label;
    label.htmlFor = id;

    const input = document.createElement("input");
    input.type = "number";
    input.id = id;
    input.min = "1";
    input.max = "180";
    input.step = "1";
    input.addEventListener("change", () => {
      void updateSetting(f.key, Number(input.value) as Settings[typeof f.key]);
    });

    row.append(label, input);
    el.settingsList.appendChild(row);
    numberInputs.set(f.key, input);
  }

  for (const f of TOGGLE_FIELDS) {
    const row = document.createElement("div");
    row.className = "field";

    const label = document.createElement("label");
    label.textContent = f.label;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-label", f.label);
    btn.addEventListener("click", () => {
      void updateSetting(f.key, !(settings[f.key] as boolean) as Settings[typeof f.key]);
    });

    row.append(label, btn);
    el.settingsList.appendChild(row);
    toggleButtons.set(f.key, btn);
  }
}

function refreshSettingsForm(): void {
  for (const [key, input] of numberInputs) {
    input.value = String(settings[key]);
  }
  for (const [key, btn] of toggleButtons) {
    btn.setAttribute("aria-checked", String(settings[key] as boolean));
  }
}

async function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await applySettings(normalize({ ...settings, [key]: value }));
}

async function applySettings(next: Settings): Promise<void> {
  settings = await saveSettings(next);
  cfg = toTimerConfig(settings);
  // Mid-block changes apply to the next block; only refresh the idle readout.
  if (state.phase === "idle") state = { ...state, msRemaining: cfg.focusMs };
  refreshSettingsForm();
  render();
  if (settings.notify) void ensureNotifyPermission();
}

function openSettings(): void {
  settingsOpen = true;
  refreshSettingsForm();
  el.settings.hidden = false;
}

function closeSettings(): void {
  settingsOpen = false;
  el.settings.hidden = true;
}

// ---- boot ----

async function boot(): Promise<void> {
  el.appLabel.textContent = APP_NAME.toLowerCase();
  settings = await loadSettings();
  cfg = toTimerConfig(settings);
  state = initialState(cfg);

  buildSettingsForm();
  refreshSettingsForm();
  wireControls();
  wireKeyboard();

  await listen(EVT.restSkip, () => {
    if (state.phase === "restRunning") dispatch({ type: "SKIP_REST" });
  });

  if (settings.notify) void ensureNotifyPermission();

  render();
  ticker.start();
}

void boot();
