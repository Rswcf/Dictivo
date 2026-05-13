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
