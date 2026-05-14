import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {COLORS, FONT_MONO, FONT_SANS} from '../theme';

export const HistoryReveal = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const opIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opOut = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  const scale = interpolate(frame, [0, durationInFrames], [1.02, 1.06]);

  const captionOp = interpolate(frame, [10, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{opacity: opIn * opOut, backgroundColor: COLORS.canvas}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Img
          src={staticFile('ui/05-history.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'brightness(0.95)',
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 60,
          textAlign: 'center',
          fontFamily: FONT_SANS,
          fontSize: 40,
          fontWeight: 500,
          color: COLORS.ink,
          letterSpacing: -0.3,
          opacity: captionOp,
          textShadow: '0 2px 24px rgba(0,0,0,0.85)',
        }}
      >
        Saved{' '}
        <span style={{color: COLORS.accentText, fontWeight: 600}}>locally</span>.{' '}
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 28,
            color: COLORS.muted,
          }}
        >
          Never uploaded.
        </span>
      </div>
    </AbsoluteFill>
  );
};
