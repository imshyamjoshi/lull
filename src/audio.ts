// Transition chime, synthesized with the Web Audio API.
//
// No audio file is shipped: a soft two-note sine chime is generated locally at
// runtime. This keeps the bundle tiny and avoids any external/media asset while
// still honoring "a short, soft chime" (see DEVLOG for the deviation from a .wav).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    // Autoplay policies may leave the context suspended until a user gesture.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A single soft sine note with a gentle attack/release envelope. */
function note(ac: AudioContext, freq: number, startAt: number, duration: number, peak: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(peak, startAt + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/**
 * Play the transition chime if `enabled`. A calm rising two-note interval
 * (A5 -> E6) at low volume. Fails silently if audio is unavailable.
 */
export function playChime(enabled: boolean): void {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  const t = ac.currentTime;
  note(ac, 880.0, t, 0.5, 0.18);
  note(ac, 1318.51, t + 0.16, 0.6, 0.14);
}
