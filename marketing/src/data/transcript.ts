// Whisper word-level timings for the Trump victory speech clip.
// Each entry has the text (preserving leading spaces) and start/end in seconds.

type RawSeg = {
  text: string;
  timestamps: {from: string; to: string};
};

type Word = {
  text: string;
  start: number;
  end: number;
};

const parseTs = (ts: string): number => {
  // "00:00:01,390" → 1.39
  const [hms, ms] = ts.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
};

import raw from '../../public/data/transcript.json';

const segments = (raw as {transcription: RawSeg[]}).transcription;

export const WORDS: Word[] = segments
  .filter((s) => s.text.trim().length > 0)
  .map((s) => ({
    text: s.text,
    start: parseTs(s.timestamps.from),
    end: parseTs(s.timestamps.to),
  }));

// Total speech duration in seconds (use the last word's end time)
export const SPEECH_DURATION = WORDS.length
  ? WORDS[WORDS.length - 1].end
  : 18;

// Full transcript as a single string (handy for the final reveal)
export const FULL_TRANSCRIPT = WORDS.map((w) => w.text).join('').trim();
