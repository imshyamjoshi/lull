// Boots the main timer window: owns the state machine, the render loop, and the
// side effects (chime, notifications, per-monitor rest windows, tray tooltip).

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, availableMonitors, currentMonitor, type Monitor } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

import { TICK_MS, EVT, REST_WINDOW_PREFIX } from "./config.ts";
import { icons } from "./icons.ts";
import { byId, setText, toggleClass } from "./dom.ts";
import { createTicker, formatClock, splitHMS, hmsToMs } from "./timer.ts";
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
  phase: byId("phase"),
  digits: byId("digits"),
  editor: byId("editor"),
  primary: byId<HTMLButtonElement>("primary"),
  primaryIco: byId("primaryIco"),
  primaryLabel: byId("primaryLabel"),
  reset: byId<HTMLButtonElement>("reset"),
  resetIco: byId("resetIco"),
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
let lastTooltip = "";

const ticker = createTicker(onTick, TICK_MS);

// ---- dispatch + effects ----

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
    maybeNotify("Time to rest", "Look away and rest your eyes.");
    void openRestWindows(state.isLongRest, state.targetEndAt ?? Date.now());
  } else if (leavingRest) {
    playChime(settings.sound);
    void closeRestWindows();
    if (nextPhase === "focusRunning") maybeNotify("Back to focus", "Your break is over.");
  }
}

function onTick(now: number): void {
  apply({ type: "TICK", now });
  renderDigits();
  updateTrayTooltip();
  if (state.phase === "focusRunning" && state.msRemaining <= 0) {
    dispatch({ type: "FOCUS_COMPLETE" });
  } else if (state.phase === "restRunning" && state.msRemaining <= 0) {
    dispatch({ type: "REST_COMPLETE" });
  }
}

// ---- per-monitor rest windows (blackout on every screen) ----

let restPayload: { isLongRest: boolean; endAt: number } | null = null;
let restLabels: string[] = [];

async function openRestWindows(isLongRest: boolean, endAt: number): Promise<void> {
  restPayload = { isLongRest, endAt };
  await closeRestWindows();

  let monitors: Monitor[] = [];
  try {
    monitors = await availableMonitors();
    if (monitors.length === 0) {
      const cur = await currentMonitor();
      if (cur) monitors = [cur];
    }
  } catch {
    monitors = [];
  }

  restLabels = [];
  monitors.forEach((m, i) => {
    const label = `${REST_WINDOW_PREFIX}${i}`;
    restLabels.push(label);
    const w = new WebviewWindow(label, {
      url: "rest.html",
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: i === 0,
      visible: false,
      width: 200,
      height: 200,
    });
    w.once("tauri://created", () => void placeRestWindow(w, m, i === 0));
    w.once("tauri://error", () => {
      /* If a monitor window fails, the others still cover their screens. */
    });
  });
}

async function placeRestWindow(w: WebviewWindow, m: Monitor, primary: boolean): Promise<void> {
  try {
    await w.setPosition(new PhysicalPosition(m.position.x, m.position.y));
    if (!settings.fullscreenRest) {
      await w.setSize(new PhysicalSize(m.size.width, m.size.height));
    }
    await w.show();
    if (settings.fullscreenRest) await w.setFullscreen(true);
    await w.setAlwaysOnTop(true);
    if (primary) await w.setFocus();
  } catch {
    /* best effort */
  }
}

async function closeRestWindows(): Promise<void> {
  const labels = restLabels;
  restLabels = [];
  await Promise.all(
    labels.map(async (label) => {
      try {
        const w = await WebviewWindow.getByLabel(label);
        if (w) await w.close();
      } catch {
        /* noop */
      }
    }),
  );
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

// ---- tray tooltip ----

function updateTrayTooltip(): void {
  let text: string;
  switch (state.phase) {
    case "idle":
      text = "Lull — ready";
      break;
    case "focusRunning":
      text = `Focus — ${formatClock(state.msRemaining)}`;
      break;
    case "focusPaused":
      text = `Paused — ${formatClock(state.msRemaining)}`;
      break;
    case "restRunning":
      text = `Rest — ${formatClock(state.msRemaining)}`;
      break;
  }
  if (text === lastTooltip) return;
  lastTooltip = text;
  void invoke("set_tray_tooltip", { text }).catch(() => {});
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
  renderClock();
  renderControls();
  renderDots();
}

function renderPhase(): void {
  setText(el.phase, PHASE_LABEL[state.phase]);
  toggleClass(el.phase, "is-active", state.phase === "focusRunning");
}

function renderClock(): void {
  const idle = state.phase === "idle";
  el.editor.hidden = !idle;
  el.digits.hidden = idle;
  if (idle) {
    refreshEditor();
  } else {
    renderDigits();
  }
}

function renderDigits(): void {
  if (state.phase === "idle") return;
  setText(el.digits, formatClock(state.msRemaining));
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

  if (label !== lastPrimaryLabel) {
    el.primaryIco.innerHTML = icon;
    el.primaryLabel.textContent = label;
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

// ---- home-screen H:M:S editor ----

interface EditorUnit {
  input: HTMLInputElement;
  max: number;
}
const editorUnits: Record<"h" | "m" | "s", EditorUnit | null> = { h: null, m: null, s: null };

function buildEditor(): void {
  el.editor.replaceChildren();
  const specs: { key: "h" | "m" | "s"; label: string; max: number }[] = [
    { key: "h", label: "hours", max: 23 },
    { key: "m", label: "min", max: 59 },
    { key: "s", label: "sec", max: 59 },
  ];

  specs.forEach((spec, idx) => {
    if (idx > 0) {
      const sep = document.createElement("span");
      sep.className = "unit-sep";
      sep.textContent = ":";
      el.editor.appendChild(sep);
    }

    const unit = document.createElement("div");
    unit.className = "unit";

    const up = document.createElement("button");
    up.type = "button";
    up.className = "spin";
    up.innerHTML = icons.chevronUp;
    up.setAttribute("aria-label", `Increase ${spec.label}`);
    up.addEventListener("click", () => stepUnit(spec.key, +1, spec.max));

    const input = document.createElement("input");
    input.className = "unit-val";
    input.type = "number";
    input.min = "0";
    input.max = String(spec.max);
    input.inputMode = "numeric";
    input.setAttribute("aria-label", spec.label);
    input.addEventListener("change", commitEditor);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        stepUnit(spec.key, +1, spec.max);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        stepUnit(spec.key, -1, spec.max);
      }
    });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "spin";
    down.innerHTML = icons.chevronDown;
    down.setAttribute("aria-label", `Decrease ${spec.label}`);
    down.addEventListener("click", () => stepUnit(spec.key, -1, spec.max));

    const label = document.createElement("span");
    label.className = "unit-label";
    label.textContent = spec.label;

    unit.append(up, input, down, label);
    el.editor.appendChild(unit);
    editorUnits[spec.key] = { input, max: spec.max };
  });
}

function editorFocused(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLElement && el.editor.contains(a);
}

function refreshEditor(): void {
  if (editorFocused()) return; // don't clobber a field being edited
  const { h, m, s } = splitHMS(cfg.focusMs);
  const vals = { h, m, s };
  (Object.keys(editorUnits) as ("h" | "m" | "s")[]).forEach((k) => {
    const u = editorUnits[k];
    if (u) u.input.value = String(vals[k]).padStart(2, "0");
  });
}

function readEditor(): { h: number; m: number; s: number } {
  const clampUnit = (k: "h" | "m" | "s"): number => {
    const u = editorUnits[k];
    if (!u) return 0;
    const n = Math.round(Number(u.input.value));
    if (!Number.isFinite(n)) return 0;
    return Math.min(u.max, Math.max(0, n));
  };
  return { h: clampUnit("h"), m: clampUnit("m"), s: clampUnit("s") };
}

function stepUnit(key: "h" | "m" | "s", delta: number, max: number): void {
  const cur = readEditor();
  cur[key] = Math.min(max, Math.max(0, cur[key] + delta));
  void commitEditorValues(cur.h, cur.m, cur.s);
}

function commitEditor(): void {
  const { h, m, s } = readEditor();
  void commitEditorValues(h, m, s);
}

async function commitEditorValues(h: number, m: number, s: number): Promise<void> {
  const seconds = Math.max(1, Math.floor(hmsToMs(h, m, s) / 1000));
  await applySettings(normalize({ ...settings, focusSeconds: seconds }));
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
  el.resetIco.innerHTML = icons.refresh;
  el.primary.addEventListener("click", primaryAction);
  el.reset.addEventListener("click", () => dispatch({ type: "RESET" }));
  el.gear.addEventListener("click", openSettings);
  el.settingsClose.addEventListener("click", closeSettings);
  el.resetDefaults.addEventListener("click", () => void applySettings({ ...DEFAULT_SETTINGS }));
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
    if (onInput) return; // let the time editor / number fields work

    if (e.code === "Space") {
      if (onButton) return; // a focused button already activates on Space
      e.preventDefault();
      primaryAction();
    } else if (e.key.toLowerCase() === "r") {
      dispatch({ type: "RESET" });
    }
  });
}

// ---- settings panel ----

interface DurationField {
  label: string;
  key: "shortRestSeconds" | "longRestSeconds";
}
const DURATION_FIELDS: DurationField[] = [
  { label: "Short rest", key: "shortRestSeconds" },
  { label: "Long rest", key: "longRestSeconds" },
];

const TOGGLE_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "autoStart", label: "Auto-start next block" },
  { key: "fullscreenRest", label: "Rest screen fullscreen" },
  { key: "sound", label: "Sound" },
  { key: "notify", label: "Notify at transitions" },
  { key: "alwaysOnTop", label: "Always on top" },
];

const durationInputs = new Map<DurationField["key"], { min: HTMLInputElement; sec: HTMLInputElement }>();
let blocksInput: HTMLInputElement | null = null;
const toggleButtons = new Map<keyof Settings, HTMLButtonElement>();

function makeNumberInput(min: number, max: number): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = "1";
  return input;
}

function buildSettingsForm(): void {
  el.settingsList.replaceChildren();

  for (const f of DURATION_FIELDS) {
    const row = document.createElement("div");
    row.className = "field";
    const label = document.createElement("label");
    label.textContent = f.label;

    const inputs = document.createElement("div");
    inputs.className = "field-inputs";
    const min = makeNumberInput(0, 999);
    const minSub = document.createElement("span");
    minSub.className = "sub";
    minSub.textContent = "min";
    const sec = makeNumberInput(0, 59);
    const secSub = document.createElement("span");
    secSub.className = "sub";
    secSub.textContent = "sec";
    min.setAttribute("aria-label", `${f.label} minutes`);
    sec.setAttribute("aria-label", `${f.label} seconds`);
    min.addEventListener("change", () => void commitDuration(f.key));
    sec.addEventListener("change", () => void commitDuration(f.key));

    inputs.append(min, minSub, sec, secSub);
    row.append(label, inputs);
    el.settingsList.appendChild(row);
    durationInputs.set(f.key, { min, sec });
  }

  // Blocks before long rest
  {
    const row = document.createElement("div");
    row.className = "field";
    const label = document.createElement("label");
    label.textContent = "Blocks before long rest";
    const input = makeNumberInput(1, 12);
    input.setAttribute("aria-label", "Blocks before long rest");
    input.addEventListener("change", () => {
      void applySettings(normalize({ ...settings, blocksBeforeLongRest: Number(input.value) }));
    });
    const inputs = document.createElement("div");
    inputs.className = "field-inputs";
    inputs.appendChild(input);
    row.append(label, inputs);
    el.settingsList.appendChild(row);
    blocksInput = input;
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
      void applySettings(normalize({ ...settings, [f.key]: !(settings[f.key] as boolean) }));
    });
    row.append(label, btn);
    el.settingsList.appendChild(row);
    toggleButtons.set(f.key, btn);
  }
}

async function commitDuration(key: DurationField["key"]): Promise<void> {
  const pair = durationInputs.get(key);
  if (!pair) return;
  const mins = Math.max(0, Math.floor(Number(pair.min.value) || 0));
  const secs = Math.max(0, Math.min(59, Math.floor(Number(pair.sec.value) || 0)));
  const seconds = Math.max(1, mins * 60 + secs);
  await applySettings(normalize({ ...settings, [key]: seconds }));
}

function refreshSettingsForm(): void {
  for (const [key, pair] of durationInputs) {
    const total = settings[key];
    pair.min.value = String(Math.floor(total / 60));
    pair.sec.value = String(total % 60);
  }
  if (blocksInput) blocksInput.value = String(settings.blocksBeforeLongRest);
  for (const [key, btn] of toggleButtons) {
    btn.setAttribute("aria-checked", String(settings[key] as boolean));
  }
}

async function applySettings(next: Settings): Promise<void> {
  const prevAlwaysOnTop = settings.alwaysOnTop;
  settings = await saveSettings(next);
  cfg = toTimerConfig(settings);
  // Mid-block changes apply to the next block; only refresh the idle readout.
  if (state.phase === "idle") state = { ...state, msRemaining: cfg.focusMs };
  refreshSettingsForm();
  render();
  if (settings.notify) void ensureNotifyPermission();
  if (settings.alwaysOnTop !== prevAlwaysOnTop) void applyAlwaysOnTop();
}

async function applyAlwaysOnTop(): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
  } catch {
    /* noop */
  }
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
  settings = await loadSettings();
  cfg = toTimerConfig(settings);
  state = initialState(cfg);

  buildEditor();
  buildSettingsForm();
  refreshSettingsForm();
  wireControls();
  wireKeyboard();

  // Rest windows announce readiness; (re)send the current payload to them.
  await listen(EVT.restReady, () => {
    if (state.phase === "restRunning" && restPayload) void emit(EVT.restBegin, restPayload);
  });
  await listen(EVT.restSkip, () => {
    if (state.phase === "restRunning") dispatch({ type: "SKIP_REST" });
  });
  await listen(EVT.trayToggle, () => primaryAction());

  if (settings.notify) void ensureNotifyPermission();
  void applyAlwaysOnTop();

  render();
  ticker.start();
}

void boot();
