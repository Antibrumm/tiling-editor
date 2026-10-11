import { afterEach, expect, test, vi } from 'vitest';
import { PerimeterClipper } from '../src/rendering/perimeter-clipper';
import { createPatternPainter } from '../src/rendering/pattern-painter';

const square = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];
const stepped = [
  [0, 0],
  [100, 0],
  [100, 40],
  [40, 40],
  [40, 100],
  [0, 100],
];
const clipper = new PerimeterClipper();

function contains(polygon, [x, y]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i],
      [bx, by] = polygon[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

afterEach(() => vi.unstubAllGlobals());

test.each(
  [stepped, stepped.slice().reverse(), [...stepped, stepped[0], stepped[0]]].map((points) => ({
    points,
  })),
)(
  'insets concave corners with square joins regardless of winding or repeated endpoints',
  ({ points }) => {
    const bands = clipper.bands(points, 5);
    const untiled = (point) => bands.some((band) => contains(band, point));
    expect(untiled([36, 36])).toBe(true);
    expect(untiled([34, 34])).toBe(false);
    expect(untiled([4, 70])).toBe(true);
    expect(untiled([6, 70])).toBe(false);
  },
);

test('keeps diagonal edge distances and handles zero and oversized insets', () => {
  const triangle = [
    [0, 0],
    [100, 0],
    [0, 100],
  ];
  const bands = clipper.bands(triangle, 5);
  expect(bands.some((band) => contains(band, [47, 47]))).toBe(true);
  expect(bands.some((band) => contains(band, [40, 40]))).toBe(false);
  expect(clipper.bands(square, 0)).toEqual([]);
  expect(clipper.bands(square, 60).some((band) => contains(band, [50, 50]))).toBe(true);
});

test.each([false, true])(
  'anchors rotated wall/region patterns to inset plus offsets (region: %s)',
  (region) => {
    vi.stubGlobal(
      'Path2D',
      class {
        rect() {}
        moveTo() {}
        lineTo() {}
        closePath() {}
      },
    );
    const ctx = {
      save() {},
      restore() {},
      clip() {},
      fill() {},
      fillRect() {},
      translate: vi.fn(),
      rotate: vi.fn(),
    };
    const paint = createPatternPainter(() => {});
    const surface = {
      points: square,
      pattern: 'grid',
      patternX: 3,
      patternY: -2,
      patternRotation: 90,
      patternInset: 5,
      ...(region ? { perimeterPoints: square } : {}),
    };
    const patterns = new Map([
      ['grid', { tileWidth: 10, tileHeight: 10, borderSize: 0, tileColor: 'red', tileTexture: '' }],
    ]);
    paint(ctx, {}, surface, patterns, null, 1, 1);
    expect(ctx.translate).toHaveBeenCalledWith(8, 3);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    ctx.translate.mockClear();
    paint(ctx, {}, { ...surface, patternInset: 0 }, patterns, null, 1, 1);
    expect(ctx.translate).toHaveBeenCalledWith(3, -2);
  },
);
