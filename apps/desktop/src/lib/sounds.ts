/**
 * Audio cues for Dictivo. Generated programmatically via Web Audio so we
 * don't have to bundle any audio files (smaller installer, no licensing
 * questions about a third-party sound effect).
 *
 * The exported START_SOUND_VARIANTS array drives the Settings UI: each
 * entry is self-contained — name, human label, description, and a play()
 * fn. Adding a new variant is a one-line append.
 */

export type StartSoundId = "soft" | "strong" | "triple" | "sharp" | "harmony";

// User-tested in 0.2.7 across 5 candidates; "Triple beep" had the best
// "I noticed it without being annoying" balance.
export const DEFAULT_START_SOUND: StartSoundId = "triple";

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
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
  if (sharedContext.state === "suspended") {
    void sharedContext.resume().catch(() => undefined);
  }
  return sharedContext;
}

export type StartSoundVariant = {
  id: StartSoundId;
  label: string;
  description: string;
  play: (ctx: AudioContext) => void;
};

export const START_SOUND_VARIANTS: StartSoundVariant[] = [
  {
    id: "soft",
    label: "Soft chime",
    description: "Gentle 660 → 880 Hz sine, the original 0.2.5 sound. Quietest.",
    play: (ctx) => scheduleChime(ctx, { startFreq: 660, endFreq: 880, duration: 0.12, gain: 0.18 })
  },
  {
    id: "strong",
    label: "Strong chime (recommended)",
    description: "660 → 1100 Hz triangle wave with audible overtones. ~2× louder than Soft.",
    play: (ctx) => scheduleChime(ctx, { startFreq: 660, endFreq: 1100, duration: 0.18, gain: 0.4, type: "triangle" })
  },
  {
    id: "triple",
    label: "Triple beep (Siri-style)",
    description: "Three quick ascending tones: 660 / 880 / 1100 Hz. Recognizable, strong presence.",
    play: (ctx) => scheduleTripleBeep(ctx)
  },
  {
    id: "sharp",
    label: "Sharp pulse",
    description: "Single 1320 Hz square-wave blip. 8-bit feel, attention-grabbing.",
    play: (ctx) => scheduleChime(ctx, { startFreq: 1320, endFreq: 1320, duration: 0.08, gain: 0.45, type: "square" })
  },
  {
    id: "harmony",
    label: "Bass + chime",
    description: "Low 220 Hz thump under a 1100 Hz chime. Rich and professional.",
    play: (ctx) => scheduleBassHarmony(ctx)
  }
];

const SOUND_LOOKUP: Record<StartSoundId, StartSoundVariant> = Object.fromEntries(
  START_SOUND_VARIANTS.map((v) => [v.id, v])
) as Record<StartSoundId, StartSoundVariant>;

/** Play whichever start-sound the user has chosen. Called from App.tsx on
 * every dictation start. Falls back to the default variant for invalid IDs. */
export function playStartSound(variantId: StartSoundId = DEFAULT_START_SOUND) {
  const ctx = getContext();
  if (!ctx) return;
  const variant = SOUND_LOOKUP[variantId] ?? SOUND_LOOKUP[DEFAULT_START_SOUND];
  variant.play(ctx);
}

/** Backwards-compat shim for the 0.2.6 callsite. */
export function playRecordingStartSound() {
  playStartSound();
}

/** Falling tone reserved for "transcript ready" in v1.1. */
export function playRecordingDoneSound() {
  const ctx = getContext();
  if (!ctx) return;
  scheduleChime(ctx, { startFreq: 880, endFreq: 660, duration: 0.14, gain: 0.18 });
}

type ChimeSpec = {
  startFreq: number;
  endFreq: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

/**
 * Render a single oscillator chime with a pluck envelope (fast attack,
 * exponential decay). Exported for unit testing — tests inject a fake
 * AudioContext and assert the right scheduling calls were made.
 */
export function scheduleChime(ctx: AudioContext, spec: ChimeSpec) {
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = spec.type ?? "sine";
    osc.frequency.setValueAtTime(spec.startFreq, now);
    if (spec.endFreq !== spec.startFreq) {
      osc.frequency.linearRampToValueAtTime(spec.endFreq, now + spec.duration);
    }

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(spec.gain, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + spec.duration + 0.06);

    osc.connect(gainNode).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + spec.duration + 0.08);
  } catch {
    // No-op on audio-graph construction failure.
  }
}

/** Three quick ascending sine pips. */
export function scheduleTripleBeep(ctx: AudioContext) {
  const FREQS = [660, 880, 1100];
  const PIP_MS = 0.07;
  const GAP_MS = 0.025;
  try {
    const startNow = ctx.currentTime;
    FREQS.forEach((freq, index) => {
      const offset = startNow + index * (PIP_MS + GAP_MS);
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, offset);
      gainNode.gain.setValueAtTime(0, offset);
      gainNode.gain.linearRampToValueAtTime(0.32, offset + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.001, offset + PIP_MS + 0.02);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start(offset);
      osc.stop(offset + PIP_MS + 0.04);
    });
  } catch {
    // ignore
  }
}

/** Bass thump under a longer high chime — most "presence" of the bunch. */
export function scheduleBassHarmony(ctx: AudioContext) {
  try {
    const now = ctx.currentTime;

    // Low layer: brief 220 Hz thump.
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bassOsc.type = "sine";
    bassOsc.frequency.setValueAtTime(220, now);
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.32, now + 0.01);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    bassOsc.connect(bassGain).connect(ctx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 0.18);

    // High layer: triangle chime that lasts a touch longer than the bass.
    const chimeOsc = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chimeOsc.type = "triangle";
    chimeOsc.frequency.setValueAtTime(1100, now + 0.02);
    chimeGain.gain.setValueAtTime(0, now + 0.02);
    chimeGain.gain.linearRampToValueAtTime(0.28, now + 0.03);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    chimeOsc.connect(chimeGain).connect(ctx.destination);
    chimeOsc.start(now + 0.02);
    chimeOsc.stop(now + 0.26);
  } catch {
    // ignore
  }
}
