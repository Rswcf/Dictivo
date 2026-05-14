import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {COLORS, DOT_GRID_BG, FONT_MONO, FONT_SANS} from '../theme';
import {MicIcon} from '../components/Icons';

const CHIPS = ['Free', 'MIT open source', 'macOS · Windows'];

export const Outro = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const logoSpring = spring({frame, fps, config: {damping: 14, stiffness: 130}});

  const chipsOp = interpolate(frame, [18, 36], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const urlOp = interpolate(frame, [44, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        ...DOT_GRID_BG,
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
          transform: `scale(${logoSpring})`,
        }}
      >
        <div
          style={{
            width: 134,
            height: 134,
            borderRadius: 30,
            background: COLORS.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 24px 60px ${COLORS.accentGlow}`,
          }}
        >
          <MicIcon size={76} color={COLORS.canvas} strokeWidth={1.85} />
        </div>
        <div
          style={{
            fontSize: 156,
            fontWeight: 700,
            letterSpacing: -4,
            color: COLORS.ink,
          }}
        >
          Dictivo
        </div>
      </div>

      <div
        style={{
          marginTop: 48,
          display: 'flex',
          gap: 14,
          opacity: chipsOp,
        }}
      >
        {CHIPS.map((c, i) => {
          const op = interpolate(frame, [22 + i * 6, 36 + i * 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={c}
              style={{
                opacity: op,
                padding: '11px 24px',
                borderRadius: 999,
                background: COLORS.surface1,
                border: `1px solid ${COLORS.hairline3}`,
                color: COLORS.ink,
                fontSize: 22,
                fontWeight: 500,
              }}
            >
              {c}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 60,
          opacity: urlOp,
          fontSize: 34,
          color: COLORS.accentText,
          fontFamily: FONT_MONO,
          letterSpacing: -0.4,
        }}
      >
        github.com/Rswcf/Dictivo
      </div>
    </AbsoluteFill>
  );
};
