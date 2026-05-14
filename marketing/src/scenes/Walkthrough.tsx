import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {COLORS, FONT_SANS} from '../theme';

// Two beats: hardware scan → tier recommendation
// Each takes ~half the scene duration; cross-fade between them.

const SHOTS = [
  {
    file: 'ui/01-onboarding-scan.png',
    caption: 'Looks at your hardware…',
    captionAccent: 'hardware',
  },
  {
    file: 'ui/02-onboarding-tiers.png',
    caption: 'Picks the right Whisper model for it.',
    captionAccent: 'right Whisper model',
  },
] as const;

export const Walkthrough = () => {
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.canvas}}>
      <Sequence durationInFrames={60} premountFor={30}>
        <Shot shot={SHOTS[0]} />
      </Sequence>
      <Sequence from={55} durationInFrames={65} premountFor={30}>
        <Shot shot={SHOTS[1]} />
      </Sequence>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{shot: (typeof SHOTS)[number]}> = ({shot}) => {
  const frame = useCurrentFrame();

  // Cross-fade in/out within the local scene
  const opacityIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacityOut = interpolate(frame, [55, 65], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(opacityIn, opacityOut);

  // Subtle Ken Burns: slow zoom in
  const scale = interpolate(frame, [0, 65], [1.04, 1.1]);

  // Caption fade
  const capOp = interpolate(frame, [12, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const {caption, captionAccent, file} = shot;
  const [before, accent, after] = (() => {
    const idx = caption.indexOf(captionAccent);
    if (idx < 0) return [caption, '', ''];
    return [
      caption.slice(0, idx),
      captionAccent,
      caption.slice(idx + captionAccent.length),
    ];
  })();

  return (
    <AbsoluteFill style={{opacity}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Img
          src={staticFile(file)}
          style={{width: '100%', height: '100%', objectFit: 'contain'}}
        />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 80,
          textAlign: 'center',
          fontFamily: FONT_SANS,
          fontSize: 40,
          fontWeight: 500,
          color: COLORS.ink,
          letterSpacing: -0.3,
          opacity: capOp,
          textShadow: '0 2px 20px rgba(0,0,0,0.7)',
        }}
      >
        <span>{before}</span>
        <span style={{color: COLORS.accentText, fontWeight: 600}}>{accent}</span>
        <span>{after}</span>
      </div>
    </AbsoluteFill>
  );
};
