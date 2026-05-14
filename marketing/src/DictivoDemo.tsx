import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {COLORS} from './theme';
import {IntroLogo} from './scenes/IntroLogo';
import {Walkthrough} from './scenes/Walkthrough';
import {DictationMoment} from './scenes/DictationMoment';
import {HistoryReveal} from './scenes/HistoryReveal';
import {Outro} from './scenes/Outro';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Scene timings in frames @ 30fps
const T = {
  intro: {start: 0, dur: 90},          // 0   - 3.0s
  walkthrough: {start: 90, dur: 120},  // 3.0 - 7.0s
  dictation: {start: 210, dur: 600},   // 7.0 - 27.0s   (18.072s audio + entry/exit padding)
  history: {start: 810, dur: 60},      // 27  - 29.0s
  outro: {start: 870, dur: 90},        // 29  - 32.0s
} as const;

export const TOTAL_FRAMES = T.outro.start + T.outro.dur; // 960 = 32s

// Audio starts when DictationMoment scene starts, after a 0.6s "press hotkey" beat
const AUDIO_DELAY_INSIDE_SCENE = 18; // frames
const AUDIO_START_FRAME = T.dictation.start + AUDIO_DELAY_INSIDE_SCENE;

export const DictivoDemo = () => {
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.canvas}}>
      <Sequence
        from={T.intro.start}
        durationInFrames={T.intro.dur}
        premountFor={30}
      >
        <IntroLogo />
      </Sequence>

      <Sequence
        from={T.walkthrough.start}
        durationInFrames={T.walkthrough.dur}
        premountFor={30}
      >
        <Walkthrough />
      </Sequence>

      <Sequence
        from={T.dictation.start}
        durationInFrames={T.dictation.dur}
        premountFor={60}
      >
        <DictationMoment audioDelayFrames={AUDIO_DELAY_INSIDE_SCENE} />
      </Sequence>

      <Sequence
        from={T.history.start}
        durationInFrames={T.history.dur}
        premountFor={30}
      >
        <HistoryReveal />
      </Sequence>

      <Sequence
        from={T.outro.start}
        durationInFrames={T.outro.dur}
        premountFor={30}
      >
        <Outro />
      </Sequence>

      <Sequence from={AUDIO_START_FRAME}>
        <Audio src={staticFile('audio/trump.mp3')} volume={0.85} />
      </Sequence>
    </AbsoluteFill>
  );
};
