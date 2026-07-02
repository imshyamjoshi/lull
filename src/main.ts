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
import { enable as enableAutostart, disable as disableAutostart } from "@tauri-apps/plugin-autostart";

import { TICK_MS, EVT, REST_WINDOW_PREFIX } from "./config.ts";
import { icons } from "./icons.ts";
import { byId, setText, toggleClass } from "./dom.ts";
import { createTicker, formatClock, splitHMS, hmsToMs } from "./timer.ts";
import { reduce, initialState, type AppState, type AppEvent, type TimerConfig } from "./state.ts";
import {
  initMicroBreak,
  enterFocus as microEnterFocus,
  leaveFocus as microLeaveFocus,
  cancel as microCancel,
  reschedule as microReschedule,
  isDue as microIsDue,
  isElapsed as microIsElapsed,
  begin as microBegin,
  type MicroBreakState,
} from "./microbreak.ts";
import {
  loadSettings,
  saveSettings,
  normalize,
  toTimerConfig,
  DEFAULT_SETTINGS,
  type Settings,
  type Preset,
} from "./settings.ts";
import { playChime } from "./audio.ts";
import { loadStats, saveStats, recordFocusBlock, todayString, DEFAULT_STATS, type Stats } from "./stats.ts";

// ---- elements ----
const el = {
  phase: byId("phase"),
  digits: byId("digits"),
  editor: byId("editor"),
  presets: byId("presets"),
  restConfig: byId("restConfig"),
  stats: byId("stats"),
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
let stats: Stats = { ...DEFAULT_STATS };

// 20-20-20 micro-breaks: an independent, timestamp-driven sub-timer layered on
// top of a running focus block (see microbreak.ts). A micro-break pauses/
// resumes the real focus countdown via the existing PAUSE/RESUME events, so
// "pause and extend" reuses already-tested drift-free reducer logic.
let microBreak: MicroBreakState = initMicroBreak();

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
  const enteringFocus = nextPhase === "focusRunning" && prevPhase !== "focusRunning";
  const leavingFocus = prevPhase === "focusRunning" && nextPhase !== "focusRunning";

  if (enteringRest) {
    playChime(settings.sound);
    maybeNotify("Time to rest", "Look away and rest your eyes.");
    void openRestWindows({
      isLongRest: state.isLongRest,
      endAt: state.targetEndAt ?? Date.now(),
      breathingCircleEnabled: settings.breathingCircleEnabled,
    });
    // A rest only follows a completed focus block (see FOCUS_COMPLETE in
    // state.ts) — this is exactly the moment to record it.
    stats = recordFocusBlock(stats, todayString(Date.now()), Math.round(cfg.focusMs / 1000));
    void saveStats(stats);
    renderStats();
  } else if (leavingRest) {
    playChime(settings.sound);
    void closeRestWindows();
    if (nextPhase === "focusRunning") maybeNotify("Back to focus", "Your break is over.");
  }

  if (enteringFocus) {
    const wasActive = microBreak.active;
    microBreak = microEnterFocus(microBreak, {
      freshBlock: prevPhase === "idle",
      enabled: settings.microBreaksEnabled,
      now: Date.now(),
    });
    if (wasActive) void closeRestWindows();
  } else if (leavingFocus) {
    microBreak = microLeaveFocus(microBreak, Date.now());
  }

  // Defensive: RESET can jump focusPaused -> idle directly, bypassing the
  // enteringFocus/leavingFocus branches above. Never leave an orphaned
  // fullscreen micro-break window covering the screen.
  if (nextPhase === "idle" && microBreak.active) {
    microBreak = microCancel(microBreak);
    void closeRestWindows();
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
  } else if (state.phase === "focusRunning" && microIsDue(microBreak, now)) {
    triggerMicroBreak(now);
  } else if (microIsElapsed(microBreak, now)) {
    dispatch({ type: "RESUME" });
  }
}

function triggerMicroBreak(now: number): void {
  microBreak = microBegin(microBreak, now);
  const endAt = microBreak.endsAt ?? now;
  dispatch({ type: "PAUSE" });
  void openRestWindows({ isLongRest: false, endAt, isMicroBreak: true });
}

// ---- per-monitor rest windows (blackout on every screen; also used for
// 20-20-20 micro-breaks) ----

interface RestPayload {
  isLongRest: boolean;
  endAt: number;
  isMicroBreak?: boolean;
  breathingCircleEnabled?: boolean;
}

let restPayload: RestPayload | null = null;
let restLabels: string[] = [];

async function openRestWindows(payload: RestPayload): Promise<void> {
  restPayload = payload;
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
      text = "Blink — ready";
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
  renderStats();
}

function renderPhase(): void {
  setText(el.phase, PHASE_LABEL[state.phase]);
  toggleClass(el.phase, "is-active", state.phase === "focusRunning");
}

function renderClock(): void {
  const idle = state.phase === "idle";
  el.editor.hidden = !idle;
  el.digits.hidden = idle;
  el.presets.hidden = !idle;
  el.restConfig.hidden = !idle;
  if (idle) {
    refreshEditor();
    renderPresets();
    refreshRestConfig();
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

function renderStats(): void {
  const parts: string[] = [
    `${stats.focusBlocksToday} block${stats.focusBlocksToday === 1 ? "" : "s"} today`,
  ];
  if (stats.streakDays > 0) {
    parts.push(`${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"} streak`);
  }
  setText(el.stats, parts.join(" · "));
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

function refreshEditor(): void {
  // Only skip while the user is typing in a value field — arrow buttons (also
  // inside the editor) must still trigger a refresh.
  const a = document.activeElement;
  if (a instanceof HTMLInputElement && el.editor.contains(a)) return;
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

// ---- home-screen presets (built-in + user-saved) ----

const BUILT_IN_PRESETS: Preset[] = [
  { id: "classic", label: "Classic", focusSeconds: 25 * 60, shortRestSeconds: 5 * 60, longRestSeconds: 15 * 60, blocksBeforeLongRest: 4 },
  { id: "deep", label: "Deep Work", focusSeconds: 50 * 60, shortRestSeconds: 10 * 60, longRestSeconds: 20 * 60, blocksBeforeLongRest: 3 },
  { id: "short", label: "Short", focusSeconds: 15 * 60, shortRestSeconds: 3 * 60, longRestSeconds: 15 * 60, blocksBeforeLongRest: 4 },
];

/** True while the inline "name this preset" form is open. Reset on save/cancel. */
let addingPreset = false;

function matchingPresetId(s: Settings): string | null {
  const all: Preset[] = [...BUILT_IN_PRESETS, ...s.customPresets];
  const p = all.find(
    (p) =>
      p.focusSeconds === s.focusSeconds &&
      p.shortRestSeconds === s.shortRestSeconds &&
      p.longRestSeconds === s.longRestSeconds &&
      p.blocksBeforeLongRest === s.blocksBeforeLongRest,
  );
  return p ? p.id : null;
}

function applyPreset(p: Preset): void {
  void applySettings(
    normalize({
      ...settings,
      focusSeconds: p.focusSeconds,
      shortRestSeconds: p.shortRestSeconds,
      longRestSeconds: p.longRestSeconds,
      blocksBeforeLongRest: p.blocksBeforeLongRest,
    }),
  );
}

function makePresetChip(label: string, isActive: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = label;
  toggleClass(btn, "is-active", isActive);
  btn.addEventListener("click", onClick);
  return btn;
}

function makeCustomPresetChip(p: Preset, isActive: boolean): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "chip-wrap";
  wrap.appendChild(makePresetChip(p.label, isActive, () => applyPreset(p)));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chip-remove";
  remove.innerHTML = icons.x;
  remove.setAttribute("aria-label", `Delete preset "${p.label}"`);
  remove.addEventListener("click", (e) => {
    e.stopPropagation();
    void applySettings(
      normalize({ ...settings, customPresets: settings.customPresets.filter((c) => c.id !== p.id) }),
    );
  });
  wrap.appendChild(remove);
  return wrap;
}

function saveCurrentAsPreset(label: string): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const preset: Preset = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: trimmed,
    focusSeconds: settings.focusSeconds,
    shortRestSeconds: settings.shortRestSeconds,
    longRestSeconds: settings.longRestSeconds,
    blocksBeforeLongRest: settings.blocksBeforeLongRest,
  };
  addingPreset = false;
  void applySettings(normalize({ ...settings, customPresets: [...settings.customPresets, preset] }));
}

function buildAddPresetControl(): HTMLElement {
  if (!addingPreset) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "chip chip-add";
    add.textContent = "+ Save preset";
    add.addEventListener("click", () => {
      addingPreset = true;
      renderPresets();
    });
    return add;
  }

  const form = document.createElement("span");
  form.className = "preset-add-form";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Preset name";
  input.maxLength = 24;
  input.setAttribute("aria-label", "New preset name");

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "icon-btn";
  confirmBtn.innerHTML = icons.check;
  confirmBtn.setAttribute("aria-label", "Save preset");
  confirmBtn.addEventListener("click", () => saveCurrentAsPreset(input.value));

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "icon-btn";
  cancelBtn.innerHTML = icons.x;
  cancelBtn.setAttribute("aria-label", "Cancel");
  cancelBtn.addEventListener("click", () => {
    addingPreset = false;
    renderPresets();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCurrentAsPreset(input.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      addingPreset = false;
      renderPresets();
    }
  });

  form.append(input, confirmBtn, cancelBtn);
  queueMicrotask(() => input.focus());
  return form;
}

function renderPresets(): void {
  el.presets.replaceChildren();
  const active = matchingPresetId(settings);

  for (const p of BUILT_IN_PRESETS) {
    el.presets.appendChild(makePresetChip(p.label, p.id === active, () => applyPreset(p)));
  }
  for (const p of settings.customPresets) {
    el.presets.appendChild(makeCustomPresetChip(p, p.id === active));
  }

  const custom = document.createElement("button");
  custom.type = "button";
  custom.className = "chip chip-custom";
  custom.textContent = "Custom";
  custom.disabled = true;
  toggleClass(custom, "is-active", active === null);
  el.presets.appendChild(custom);

  el.presets.appendChild(buildAddPresetControl());
}

// ---- home-screen rest configuration (short rest, long rest, blocks) ----

const restConfigInputs = new Map<"shortRestSeconds" | "longRestSeconds", HTMLInputElement>();
let restConfigBlocksInput: HTMLInputElement | null = null;

function buildRestConfig(): void {
  el.restConfig.replaceChildren();

  const makeField = (label: string, build: () => HTMLInputElement): void => {
    const field = document.createElement("div");
    field.className = "rc-field";
    const lab = document.createElement("label");
    lab.textContent = label;
    const input = build();
    field.append(lab, input);
    el.restConfig.appendChild(field);
  };

  makeField("short rest (min)", () => {
    const input = makeNumberInput(0, 999);
    input.setAttribute("aria-label", "Short rest minutes");
    input.addEventListener("change", () => void commitRestMinutes("shortRestSeconds", input));
    restConfigInputs.set("shortRestSeconds", input);
    return input;
  });

  makeField("long rest (min)", () => {
    const input = makeNumberInput(0, 999);
    input.setAttribute("aria-label", "Long rest minutes");
    input.addEventListener("change", () => void commitRestMinutes("longRestSeconds", input));
    restConfigInputs.set("longRestSeconds", input);
    return input;
  });

  makeField("blocks before long rest", () => {
    const input = makeNumberInput(1, 12);
    input.setAttribute("aria-label", "Blocks before long rest");
    input.addEventListener("change", () => {
      void applySettings(normalize({ ...settings, blocksBeforeLongRest: Number(input.value) }));
    });
    restConfigBlocksInput = input;
    return input;
  });
}

async function commitRestMinutes(
  key: "shortRestSeconds" | "longRestSeconds",
  input: HTMLInputElement,
): Promise<void> {
  const minutes = Math.max(0, Math.floor(Number(input.value) || 0));
  await applySettings(normalize({ ...settings, [key]: Math.max(1, minutes * 60) }));
}

function refreshRestConfig(): void {
  for (const [key, input] of restConfigInputs) {
    input.value = String(Math.round(settings[key] / 60));
  }
  if (restConfigBlocksInput) restConfigBlocksInput.value = String(settings.blocksBeforeLongRest);
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

// ---- settings panel (behavior toggles only — timer/cycle config lives on the
// home screen: presets, the H:M:S editor, and the rest-config row) ----

const TOGGLE_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: "autoStart", label: "Auto-start next block" },
  { key: "fullscreenRest", label: "Rest screen fullscreen" },
  { key: "sound", label: "Sound" },
  { key: "notify", label: "Notify at transitions" },
  { key: "alwaysOnTop", label: "Always on top" },
  { key: "launchOnLogin", label: "Launch on login" },
  { key: "globalShortcutEnabled", label: "Global shortcut (Ctrl+Shift+Space)" },
  { key: "microBreaksEnabled", label: "20-20-20 micro-breaks" },
  { key: "breathingCircleEnabled", label: "Breathing circle on rest" },
];

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

function refreshSettingsForm(): void {
  for (const [key, btn] of toggleButtons) {
    btn.setAttribute("aria-checked", String(settings[key] as boolean));
  }
}

async function applySettings(next: Settings): Promise<void> {
  const prevAlwaysOnTop = settings.alwaysOnTop;
  const prevLaunchOnLogin = settings.launchOnLogin;
  const prevGlobalShortcut = settings.globalShortcutEnabled;
  settings = await saveSettings(next);
  cfg = toTimerConfig(settings);
  // Mid-block changes apply to the next block; only refresh the idle readout.
  if (state.phase === "idle") state = { ...state, msRemaining: cfg.focusMs };
  // Turning micro-breaks on mid-block schedules one now instead of waiting for
  // the next block; turning off just stops scheduling new ones.
  if (state.phase === "focusRunning") {
    microBreak = microReschedule(microBreak, settings.microBreaksEnabled, Date.now());
  }
  refreshSettingsForm();
  render();
  if (settings.notify) void ensureNotifyPermission();
  if (settings.alwaysOnTop !== prevAlwaysOnTop) void applyAlwaysOnTop();
  if (settings.launchOnLogin !== prevLaunchOnLogin) void applyLaunchOnLogin();
  if (settings.globalShortcutEnabled !== prevGlobalShortcut) void applyGlobalShortcut();
}

async function applyAlwaysOnTop(): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
  } catch {
    /* noop */
  }
}

async function applyGlobalShortcut(): Promise<void> {
  try {
    await invoke("set_global_shortcut_enabled", { enabled: settings.globalShortcutEnabled });
  } catch {
    /* noop */
  }
}

async function applyLaunchOnLogin(): Promise<void> {
  try {
    if (settings.launchOnLogin) await enableAutostart();
    else await disableAutostart();
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
  stats = await loadStats();
  cfg = toTimerConfig(settings);
  state = initialState(cfg);

  buildEditor();
  buildRestConfig();
  buildSettingsForm();
  refreshSettingsForm();
  wireControls();
  wireKeyboard();

  // Rest windows announce readiness; (re)send the current payload to them.
  await listen(EVT.restReady, () => {
    const showing = state.phase === "restRunning" || microBreak.active;
    if (showing && restPayload) void emit(EVT.restBegin, restPayload);
  });
  await listen(EVT.restSkip, () => {
    if (microBreak.active) dispatch({ type: "RESUME" });
    else if (state.phase === "restRunning") dispatch({ type: "SKIP_REST" });
  });
  await listen(EVT.trayToggle, () => primaryAction());
  await listen(EVT.hotkeyToggle, () => primaryAction());

  if (settings.notify) void ensureNotifyPermission();
  void applyAlwaysOnTop();
  void applyLaunchOnLogin();
  void applyGlobalShortcut();

  render();
  ticker.start();
}

void boot();
