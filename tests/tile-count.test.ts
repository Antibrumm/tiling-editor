import assert from 'node:assert/strict';
import type { Point, OutlineInput, PatternInput } from '../src/model/types';
import { test, expect } from 'vitest';
import { PlanService } from '../src/model/plan-service';
import { TileCounter } from '../src/model/tile-counter';

const rectangle = (width: number, height: number): Point[] => [
  [0, 0],
  [width, 0],
  [width, height],
  [0, height],
];
function fixture(
  points = rectangle(200, 200),
  outline: OutlineInput = {},
  patterns: PatternInput[] = [],
) {
  const service = new PlanService({
    patterns: [{ name: 'tile', tileWidth: 100, tileHeight: 100, borderSize: 0 }, ...patterns],
    walls: [{ name: 'wall', outline: { points, pattern: 'tile', ...outline } }],
  });
  const plan = service.snapshot();
  return { wall: plan.walls[0], patterns: plan.patterns };
}
function count(input: ReturnType<typeof fixture>) {
  const result = new TileCounter().count(input.wall, input.patterns)!;
  assert(result);
  return result;
}

test('reports wall and visible tile-region areas in square meters with individual counts', () => {
  const f = fixture(rectangle(2000, 1000), { patternInset: 100 }, [
    { name: 'large', tileWidth: 100, tileHeight: 200, borderSize: 0 },
  ]);
  f.wall.patternRegions.push({
    fullWall: false,
    x: 1000,
    y: 0,
    width: 1000,
    height: 1000,
    pattern: 'large',
    patternX: 0,
    patternY: 0,
    patternRotation: 0,
  });
  const result = new TileCounter().analyze(f.wall, f.patterns)!;
  expect(result.areaM2).toBe(2);
  expect(result.regions).toEqual([
    { index: 0, pattern: 'tile', areaM2: 0.72, count: 72 },
    { index: 1, pattern: 'large', areaM2: 0.72, count: 36 },
  ]);
  f.wall.patternRegions[1].x = 3000;
  const outside = new TileCounter().analyze(f.wall, f.patterns)!;
  expect(outside.regions[0].areaM2).toBeCloseTo(1.44);
  expect(outside.regions[1]).toMatchObject({ areaM2: 0, count: 0 });
});

test('reports polygon area and preserves rows for empty or unselected regions', () => {
  const f = fixture(
    [
      [0, 0],
      [2000, 0],
      [0, 1000],
    ],
    { pattern: '' },
  );
  const counter = new TileCounter();
  expect(counter.analyze(f.wall, f.patterns)!).toEqual({
    areaM2: 1,
    regions: [],
    counts: { total: 0, patterns: [] },
  });
  f.wall.patternRegions = [
    {
      fullWall: true,
      pattern: '',
      patternX: 0,
      patternY: 0,
      patternRotation: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
  ];
  expect(counter.analyze(f.wall, f.patterns)!.regions).toEqual([
    { index: 0, pattern: '', areaM2: 0, count: 0 },
  ]);
});

test('counts each full or partial tile once, excluding boundary-only contact', () => {
  expect(count(fixture()).total).toBe(4);
  expect(count(fixture(rectangle(201, 201))).total).toBe(9);
  expect(count(fixture(rectangle(200, 200), { patternX: 50, patternY: 50 })).total).toBe(9);
  expect(count(fixture(rectangle(200, 200), { patternRotation: 90 })).total).toBe(4);
  expect(count(fixture(rectangle(200, 200), { patternRotation: 45 })).total).toBe(8);
});

test('counts concave and diagonal boundaries in either winding direction', () => {
  const l: Point[] = [
    [0, 0],
    [300, 0],
    [300, 100],
    [100, 100],
    [100, 300],
    [0, 300],
  ];
  expect(count(fixture(l)).total).toBe(5);
  expect(count(fixture([...l].reverse())).total).toBe(5);
  expect(
    count(
      fixture([
        [0, 0],
        [200, 0],
        [0, 200],
      ]),
    ).total,
  ).toBe(3);
});

test('grout-only intersections do not require a tile', () => {
  const f = fixture(rectangle(105, 105));
  f.patterns[0].borderSize = 10;
  expect(count(f).total).toBe(1);
  f.wall.outline.points = [
    [101, 101],
    [109, 101],
    [109, 109],
    [101, 109],
  ];
  expect(count(f).total).toBe(0);
});

test('follows inset geometry and inset-relative offsets, including erased surfaces', () => {
  expect(count(fixture(rectangle(210, 210), { patternInset: 5 })).total).toBe(4);
  expect(count(fixture(rectangle(200, 200), { patternInset: 100 })).total).toBe(0);
  const l: Point[] = [
    [0, 0],
    [310, 0],
    [310, 110],
    [110, 110],
    [110, 310],
    [0, 310],
  ];
  expect(count(fixture(l, { patternInset: 5 })).total).toBe(5);
  const collinear: Point[] = [
    [0, 0],
    [100, 0],
    [210, 0],
    [210, 210],
    [0, 210],
    [0, 0],
  ];
  expect(count(fixture(collinear, { patternInset: 5 })).total).toBe(4);
});

test('replaces covered tiles with region patterns and deduplicates matching grids', () => {
  const f = fixture(rectangle(200, 100), {}, [
    { name: 'small', tileWidth: 50, tileHeight: 50, borderSize: 0 },
  ]);
  const region = {
    fullWall: false,
    x: 100,
    y: 0,
    width: 100,
    height: 100,
    pattern: 'small',
    patternX: 0,
    patternY: 0,
    patternRotation: 0,
  };
  f.wall.patternRegions = [region];
  expect(count(f)).toEqual({
    total: 4,
    patterns: [{ name: 'small', count: 4 }],
  });
  f.wall.patternRegions.push({ ...region, pattern: 'tile' });
  expect(count(f).total).toBe(1);
  f.wall.patternRegions = [{ ...region, x: 50, width: 100, pattern: 'tile' }];
  expect(count(f).total).toBe(2);
  f.wall.patternRegions = [{ ...region, x: 300 }];
  expect(count(f).total).toBe(0);
});

test('counts only pattern regions even when the complete wall has a base pattern', () => {
  const f = fixture(rectangle(1000, 1000));
  f.wall.patternRegions = [];
  expect(count(f)).toEqual({ total: 0, patterns: [] });
  f.wall.patternRegions = [
    {
      fullWall: false,
      x: 0,
      y: 0,
      width: 150,
      height: 100,
      pattern: 'tile',
      patternX: 0,
      patternY: 0,
      patternRotation: 0,
    },
  ];
  expect(count(f).total).toBe(2);
  f.wall.patternRegions.push({ ...f.wall.patternRegions[0], x: 500, width: 100 });
  expect(count(f).total).toBe(3);
  expect(f.wall.outline).not.toHaveProperty('pattern');
  expect(count(f).total).toBe(3);
});

test('untiled surfaces can still contain tiled regions; elements do not remove tiling', () => {
  const f = fixture(rectangle(200, 200), { pattern: '' });
  expect(count(f).total).toBe(0);
  f.wall.patternRegions = [
    {
      fullWall: false,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      pattern: 'tile',
      patternX: 0,
      patternY: 0,
      patternRotation: 0,
    },
  ];
  f.wall.objects = [{ name: 'box', x: 0, y: 0, width: 100, height: 100, depth: 10, fill: 'red' }];
  expect(count(f).total).toBe(1);
});

test('updates cached counts after pattern and geometry edits and bounds excessive work', () => {
  const f = fixture();
  const counter = new TileCounter();
  expect(counter.count(f.wall, f.patterns)!.total).toBe(4);
  f.patterns[0].tileWidth = 50;
  expect(counter.count(f.wall, f.patterns)!.total).toBe(8);
  f.wall.outline.points = rectangle(100, 100);
  expect(counter.count(f.wall, f.patterns)!.total).toBe(2);
  f.patterns[0].tileWidth = f.patterns[0].tileHeight = 0.001;
  expect(counter.count(f.wall, f.patterns)!).toBeNull();
});
