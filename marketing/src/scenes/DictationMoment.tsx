import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {COLORS, DOT_GRID_BG, FONT_MONO, FONT_SANS, RADIUS} from '../theme';
import {CheckIcon, MicIcon} from '../components/Icons';
import {SPEECH_DURATION, WORDS} from '../data/transcript';

type Props = {
  /** Frames between scene start and the audio kick-off. */
  audioDelayFrames: number;
};

export const DictationMoment: React.FC<Props> = ({audioDelayFrames}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  // Audio plays from local frame `audioDelayFrames` for SPEECH_DURATION seconds.
  const audioStartFrame = audioDelayFrames;
  const audioEndFrame = audioStartFrame + Math.ceil(SPEECH_DURATION * fps);

  // Recording is "live" between audio start and end (+ small tail)
  const isRecording = frame >= audioStartFrame && frame < audioEndFrame;
  const isComplete = frame >= audioEndFrame;

  // Scene entry/exit
  const entryOp = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const exitOp = interpolate(
    frame,
    [durationInFrames - 16, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  // Subtle Ken Burns zoom on the background to keep it from feeling static
  const bgScale = interpolate(
    frame,
    [0, durationInFrames],
    [1.02, 1.08],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill style={{...DOT_GRID_BG, opacity: entryOp * exitOp}}>
      {/* Soft accent glow that pulses with audio activity */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 45%, ${COLORS.accentGlow} 0%, transparent 60%)`,
          opacity: 0.35 + (frame >= audioStartFrame && frame < audioEndFrame ? 0.15 : 0),
          transform: `scale(${bgScale})`,
        }}
      />

      {/* Stage: the active dictation panel */}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 140px',
          fontFamily: FONT_SANS,
        }}
      >
        <DictationPanel
          frame={frame}
          fps={fps}
          audioStartFrame={audioStartFrame}
          audioEndFrame={audioEndFrame}
          isRecording={isRecording}
          isComplete={isComplete}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

type PanelProps = {
  frame: number;
  fps: number;
  audioStartFrame: number;
  audioEndFrame: number;
  isRecording: boolean;
  isComplete: boolean;
};

const DictationPanel: React.FC<PanelProps> = ({
  frame,
  fps,
  audioStartFrame,
  audioEndFrame,
  isRecording,
  isComplete,
}) => {
  // Slide in
  const panelSpring = spring({
    frame,
    fps,
    durationInFrames: 20,
    config: {damping: 18},
  });
  const panelY = interpolate(panelSpring, [0, 1], [20, 0]);

  // Keyboard prompt fades out as recording starts
  const promptOp = interpolate(
    frame,
    [audioStartFrame - 8, audioStartFrame],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  // "Transcribed" pill fades in shortly after the last word lands
  const doneOp = interpolate(
    frame,
    [audioEndFrame - 8, audioEndFrame + 10],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <div
      style={{
        width: 1480,
        background: COLORS.surface3,
        border: `1px solid ${COLORS.hairline2}`,
        borderRadius: RADIUS.card,
        boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
        padding: '52px 60px',
        opacity: panelSpring,
        transform: `translateY(${panelY}px)`,
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', gap: 14}}>
          <span
            style={{
              fontSize: 44,
              fontWeight: 700,
              color: COLORS.ink,
              letterSpacing: -1.2,
            }}
          >
            Private Dictation.
          </span>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 1.2,
              color: COLORS.accentText,
              background: COLORS.accentSoft,
              border: `1px solid ${COLORS.accent}55`,
            }}
          >
            BETA
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: COLORS.muted,
            fontSize: 18,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: COLORS.success,
              boxShadow: `0 0 12px ${COLORS.success}`,
            }}
          />
          English · Speaking in ▾
        </div>
      </div>

      <div
        style={{
          fontSize: 19,
          color: COLORS.muted,
          lineHeight: 1.5,
          maxWidth: 900,
        }}
      >
        Audio, transcripts, dictionary, snippets —{' '}
        <span style={{color: COLORS.ink, fontWeight: 500}}>
          everything stays on this device
        </span>
        . No cloud round-trip, no API keys, no account required.
      </div>

      {/* Mic + state */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '28px 0',
        }}
      >
        <MicPulse frame={frame} fps={fps} active={isRecording} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              color: isRecording ? COLORS.accentText : COLORS.ink,
            }}
          >
            {isRecording
              ? 'Recording locally…'
              : isComplete
              ? 'Local transcription complete'
              : 'Tap the mic, or press'}
          </div>
          <div
            style={{
              fontSize: 14,
              fontFamily: FONT_MONO,
              color: COLORS.faint,
            }}
          >
            {isRecording
              ? 'whisper.cpp · large-v3-turbo-q5'
              : 'Stop transcribes with the on-device engine.'}
          </div>
        </div>
        <div style={{flex: 1}} />
        <KeyboardPrompt opacity={promptOp} />
        <TranscribedPill opacity={doneOp} />
      </div>

      {/* Transcript text area */}
      <TranscriptStream
        frame={frame}
        audioStartFrame={audioStartFrame}
        fps={fps}
      />

      {/* Bottom tier toggle */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          padding: '12px 0 4px',
        }}
      >
        {(['Fast', 'Medium', 'Quality'] as const).map((tier) => {
          const active = tier === 'Fast';
          return (
            <div
              key={tier}
              style={{
                padding: '10px 26px',
                borderRadius: RADIUS.pill,
                fontSize: 18,
                fontWeight: 500,
                color: active ? COLORS.canvas : COLORS.muted,
                background: active ? COLORS.accent : 'transparent',
                border: active ? 'none' : `1px solid ${COLORS.hairline3}`,
              }}
            >
              {tier}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          fontFamily: FONT_MONO,
          color: COLORS.faint,
          paddingTop: 6,
          borderTop: `1px solid ${COLORS.hairline}`,
        }}
      >
        <span>● Engine ready · metal · Large v3 Turbo Q5</span>
        <span>⌘O ready · text in clipboard</span>
      </div>
    </div>
  );
};

const MicPulse: React.FC<{frame: number; fps: number; active: boolean}> = ({
  frame,
  fps,
  active,
}) => {
  const t = frame / fps;
  const pulse = active ? 1 + 0.06 * Math.sin(t * 6) : 1;
  const bg = active ? COLORS.accent : COLORS.surface1;
  const ring = active ? COLORS.accentGlow : 'transparent';
  return (
    <div style={{position: 'relative', width: 96, height: 96}}>
      {active && (
        <div
          style={{
            position: 'absolute',
            inset: -20,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ring} 0%, transparent 65%)`,
            transform: `scale(${1 + 0.18 * Math.sin(t * 5)})`,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: bg,
          border: `2px solid ${active ? COLORS.accent : COLORS.hairline3}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${pulse})`,
          boxShadow: active ? `0 0 40px ${COLORS.accentGlow}` : 'none',
        }}
      >
        <MicIcon
          size={42}
          color={active ? COLORS.canvas : COLORS.muted}
          strokeWidth={1.8}
        />
      </div>
    </div>
  );
};

const KeyboardPrompt: React.FC<{opacity: number}> = ({opacity}) => (
  <div
    style={{
      opacity,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <KeyCap label="⌘" />
    <KeyCap label="O" />
  </div>
);

const KeyCap: React.FC<{label: string}> = ({label}) => (
  <div
    style={{
      minWidth: 56,
      height: 56,
      padding: '0 14px',
      background: COLORS.surface1,
      border: `1px solid ${COLORS.hairline3}`,
      borderRadius: 10,
      boxShadow: `inset 0 -2px 0 ${COLORS.canvasDeep}, 0 6px 12px rgba(0,0,0,0.4)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: FONT_MONO,
      fontSize: 24,
      fontWeight: 500,
      color: COLORS.ink,
    }}
  >
    {label}
  </div>
);

const TranscribedPill: React.FC<{opacity: number}> = ({opacity}) => (
  <div
    style={{
      opacity,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 18px',
      borderRadius: RADIUS.pill,
      background: `${COLORS.success}22`,
      border: `1px solid ${COLORS.success}55`,
      color: COLORS.success,
      fontSize: 16,
      fontWeight: 500,
    }}
  >
    <CheckIcon size={18} color={COLORS.success} />
    Transcribed locally
  </div>
);

type StreamProps = {
  frame: number;
  audioStartFrame: number;
  fps: number;
};

const TranscriptStream: React.FC<StreamProps> = ({
  frame,
  audioStartFrame,
  fps,
}) => {
  // Convert each word's start time (in audio seconds) to global frame number.
  const fadeFrames = 4; // smooth char-by-char fade
  const audioSecondsElapsed = Math.max(0, (frame - audioStartFrame) / fps);

  return (
    <div
      style={{
        minHeight: 200,
        padding: '28px 32px',
        background: COLORS.canvasDeep,
        border: `1px solid ${COLORS.hairline}`,
        borderRadius: RADIUS.base,
        fontSize: 32,
        lineHeight: 1.45,
        letterSpacing: -0.2,
        color: COLORS.ink,
        fontWeight: 400,
      }}
    >
      {WORDS.map((word, i) => {
        const wordStartFrame = audioStartFrame + word.start * fps;
        const wordVisible = interpolate(
          frame,
          [wordStartFrame, wordStartFrame + fadeFrames],
          [0, 1],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
        const wordTranslate = interpolate(wordVisible, [0, 1], [4, 0]);
        return (
          <span
            key={i}
            style={{
              opacity: wordVisible,
              transform: `translateY(${wordTranslate}px)`,
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {word.text}
          </span>
        );
      })}
      <BlinkCursor visible={audioSecondsElapsed > 0 && audioSecondsElapsed < 17} frame={frame} />
    </div>
  );
};

const BlinkCursor: React.FC<{visible: boolean; frame: number}> = ({
  visible,
  frame,
}) => {
  if (!visible) return null;
  const blink = Math.floor(frame / 14) % 2;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 3,
        height: 30,
        marginLeft: 4,
        verticalAlign: 'middle',
        background: COLORS.accent,
        opacity: blink,
      }}
    />
  );
};
