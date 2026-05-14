type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

export type WorkArea = {
  position: Point;
  size: Size;
};

export function companionWindowPosition(workArea: WorkArea, windowSize: Size, margin = 24): Point {
  const minX = workArea.position.x;
  const minY = workArea.position.y;
  const maxX = Math.max(minX, workArea.position.x + workArea.size.width - windowSize.width - margin);
  const maxY = Math.max(minY, workArea.position.y + workArea.size.height - windowSize.height - margin);
  const preferredX = workArea.position.x + workArea.size.width - windowSize.width - margin;
  const preferredY = workArea.position.y + margin;

  return {
    x: clamp(preferredX, minX, maxX),
    y: clamp(preferredY, minY, maxY)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Threshold (in physical px) within which a manually-dragged companion
 * window snaps to the nearest edge of the work area. Picked to feel
 * intentional without being so eager that the user can't park the window
 * mid-screen if they want.
 */
export const COMPANION_SNAP_THRESHOLD = 40;

/**
 * After a manual drag finishes, optionally pull the window onto the
 * nearest edge of the work area. Returns null when no edge is within
 * COMPANION_SNAP_THRESHOLD — the caller leaves the position untouched in
 * that case so the user can freely place the widget mid-screen.
 *
 * Edges are tested independently (top/bottom and left/right), so a corner
 * drop will snap to both edges simultaneously and "stick" in the corner.
 *
 * Pure: takes plain numbers, returns plain numbers, easy to unit-test.
 */
export function snapToWorkAreaEdge(
  windowOrigin: Point,
  windowSize: Size,
  workArea: WorkArea,
  threshold = COMPANION_SNAP_THRESHOLD
): Point | null {
  const minX = workArea.position.x;
  const minY = workArea.position.y;
  const maxX = workArea.position.x + workArea.size.width - windowSize.width;
  const maxY = workArea.position.y + workArea.size.height - windowSize.height;

  let x = windowOrigin.x;
  let y = windowOrigin.y;
  let changed = false;

  if (Math.abs(x - minX) <= threshold) {
    x = minX;
    changed = true;
  } else if (Math.abs(x - maxX) <= threshold) {
    x = maxX;
    changed = true;
  }

  if (Math.abs(y - minY) <= threshold) {
    y = minY;
    changed = true;
  } else if (Math.abs(y - maxY) <= threshold) {
    y = maxY;
    changed = true;
  }

  if (!changed) return null;
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY)
  };
}
