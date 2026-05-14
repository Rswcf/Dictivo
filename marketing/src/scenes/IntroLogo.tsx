import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, DOT_GRID_BG, FONT_SANS} from '../theme';
import {MicIcon} from '../components/Icons';

export const IntroLogo = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const micScale = spring({frame, fps, config: {damping: 14, stiffness: 120}});
  const wordmarkOp = interpolate(frame, [10, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const wordmarkX = interpolate(frame, [10, 28], [-22, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagOp = interpolate(frame, [22, 42], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagY = interpolate(frame, [22, 42], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const exitOp = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill style={{...DOT_GRID_BG, opacity: exitOp}}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT_SANS,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            transform: `scale(${micScale})`,
          }}
        >
          <div
            style={{
              width: 124,
              height: 124,
              borderRadius: 30,
              background: COLORS.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 24px 60px ${COLORS.accentGlow}`,
            }}
          >
            <MicIcon size={68} color={COLORS.canvas} strokeWidth={1.9} />
          </div>
          <div
            style={{
              opacity: wordmarkOp,
              transform: `translateX(${wordmarkX}px)`,
              fontSize: 138,
              fontWeight: 700,
              letterSpacing: -3.5,
              color: COLORS.ink,
            }}
          >
            Dictivo
          </div>
        </div>

        <div
          style={{
            marginTop: 42,
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
            fontSize: 36,
            fontWeight: 400,
            color: COLORS.muted,
            letterSpacing: 0.2,
          }}
        >
          Voice dictation that{' '}
          <span style={{color: COLORS.accentText, fontWeight: 600}}>
            never leaves
          </span>{' '}
          your laptop
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
