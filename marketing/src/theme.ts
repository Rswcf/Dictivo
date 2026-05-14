// Real Dictivo design tokens — synced with apps/desktop/src/styles/app.css
export const COLORS = {
  canvas: '#0a0a0c',
  canvasDeep: '#07070a',
  surface1: '#14141a',
  surface2: 'rgba(20, 20, 24, 0.6)',
  surface3: 'rgba(14, 14, 18, 0.92)',
  ink: '#f1f3f4',
  ink2: '#e8eaed',
  muted: '#9aa0a6',
  faint: '#80868b',
  hairline: 'rgba(255, 255, 255, 0.05)',
  hairline2: 'rgba(255, 255, 255, 0.08)',
  hairline3: 'rgba(255, 255, 255, 0.22)',
  accent: '#a78bfa',
  accentSoft: 'rgba(167, 139, 250, 0.16)',
  accentText: '#c4b5fd',
  accentGlow: 'rgba(167, 139, 250, 0.35)',
  success: '#81c995',
  warning: '#f9c440',
  danger: '#ff6f61',
  cyanMono: '#5eead4',
} as const;

export const FONT_SANS =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const RADIUS = {
  sm: 6,
  base: 10,
  card: 24,
  pill: 999,
} as const;

// Dot-grid background used across the real Dictivo workspace
export const DOT_GRID_BG = {
  backgroundColor: COLORS.canvas,
  backgroundImage:
    'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
};
