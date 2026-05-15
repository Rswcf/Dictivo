/**
 * Audio cues for Dictivo. Generated programmatically via Web Audio so we
 * don't have to bundle any audio files (smaller installer, no licensing
 * questions about a third-party sound effect).
 *
 * Design language: short, subtle, pitch-encoded.
 *   - Start = rising tone (going up = activating)
 *   - End   = falling tone (going down = settling) — reserved for v1.1
 */

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  // SSR / test envs (jsdom) lack AudioContext entirely.
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!sharedContext) {
    try {
      sharedContext = new Ctor();
    } catch {
      return null;
    }
  }
  // Browsers and Tauri WebView suspend the context until first user gesture.
  // The hotkey press IS a user gesture, but the suspended state lingers
  // until we explicitly resume — silent failures otherwise.
  if (sharedContext.state === "suspended") {
    void sharedContext.resume().catch(() => undefined);
  }
  return sharedContext;
}

/**
 * Short rising chime that fires the moment a dictation starts. The user
 * hears it ~10 ms after the hotkey press, before they have time to start
 * speaking — confirms "yes, the mic is open."
 */
export function playRecordingStartSound() {
  const ctx = getContext();
  if (!ctx) return;
  scheduleChime(ctx, { startFreq: 660, endFreq: 880, duration: 0.12, gain: 0.15 });
}

/** Falling tone for "transcript ready / paste complete." Reserved for v1.1. */
export function playRecordingDoneSound() {
  const ctx = getContext();
  if (!ctx) return;
  scheduleChime(ctx, { startFreq: 880, endFreq: 660, duration: 0.14, gain: 0.12 });
}

type ChimeSpec = {
  startFreq: number;
  endFreq: number;
  duration: number;
  gain: number;
};

/**
 * Render a single sine-wave chime with a pluck envelope (fast attack,
 * exponential decay). Exported for unit testing — the test injects a fake
 * AudioContext and asserts the right scheduling calls were made.
 */
export function scheduleChime(ctx: AudioContext, spec: ChimeSpec) {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(spec.startFreq, now);
    osc.frequency.linearRampToValueAtTime(spec.endFreq, now + spec.duration);

    // Envelope: 10 ms attack to avoid the click of starting at full volume,
    // then exponential decay so the tone trails naturally.
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(spec.gain, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + spec.duration + 0.06);

    osc.connect(gainNode).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + spec.duration + 0.08);
  } catch {
    // If the audio graph can't be constructed (extreme low-memory / unusual
    // platform) we silently no-op. The recording itself is not affected.
  }
}
