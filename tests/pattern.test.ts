import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { PlanService } from '../src/model/plan-service';
import { YamlCodec } from '../src/codecs/yaml';
import { SvgCodec } from '../src/codecs/svg';
import { PatternRegionGeometry } from '../src/model/pattern-region-geometry';
import { TileCounter } from '../src/model/tile-counter';

let service: PlanService;
let dom: JSDOM | undefined;
const yamlCodec = new YamlCodec();
const svgCodec = new SvgCodec();

beforeEach(() => {
  service = new PlanService({
    patterns: [{ name: 'grid', tileWidth: 10, tileHeight: 10 }],
    walls: [
      {
        name: 'wall',
        outline: {
          points: [
            [0, 0],
            [100, 0],
            [100, 100],
          ],
          pattern: 'grid',
        },
        patternRegions: [{ x: 0, y: 0, width: 20, height: 20, pattern: 'grid' }],
      },
    ],
  });
});

afterEach(() => {
  dom?.window.close();
  dom = undefined;
  vi.unstubAllGlobals();
});

describe('wall patterns', () => {
  test('allows only one full-wall region per wall', () => {
    const saved = service.snapshot();
    expect(service.addPatternRegion('wall', { fullWall: true, pattern: 'grid' })).toBe(false);
    expect(service.setPatternRegion('wall', 1, 'fullWall', true)).toBe(false);
    expect(service.snapshot()).toEqual(saved);
    expect(
      () =>
        new PlanService({
          ...saved,
          walls: [
            {
              ...saved.walls[0],
              patternRegions: [saved.walls[0].patternRegions[0], saved.walls[0].patternRegions[0]],
            },
          ],
        }),
    ).toThrow('only one full-wall');
    service.setPatternRegion('wall', 0, 'fullWall', false);
    expect(service.setPatternRegion('wall', 1, 'fullWall', true)).toBe(true);
    service.removePatternRegion('wall', 1);
    expect(service.addPatternRegion('wall', { fullWall: true, pattern: 'grid' })).toBe(true);
  });
  test('migrates legacy outline tiling once and follows outline edits', () => {
    const wall = service.wall('wall')!;
    expect(wall.patternRegions).toHaveLength(2);
    expect(wall.patternRegions[0]).toMatchObject({ fullWall: true, pattern: 'grid' });
    expect(wall.patternRegions[1]).toMatchObject({ fullWall: false, width: 20 });
    expect(wall.outline).not.toHaveProperty('pattern');
    const geometry = new PatternRegionGeometry();
    expect(geometry.resolve(wall, wall.patternRegions[0])).toMatchObject({
      width: 100,
      height: 100,
    });
    service.setOutlinePoints('wall', [
      [-20, -10],
      [180, -10],
      [180, 90],
      [-20, 90],
    ]);
    expect(geometry.resolve(wall, wall.patternRegions[0])).toMatchObject({
      x: -20,
      y: -10,
      width: 200,
      height: 100,
    });
    expect(new TileCounter().count(wall, service.data.patterns)!.total).toBe(200);
    const saved = service.snapshot();
    const yaml = yamlCodec.encode(saved);
    expect(yaml.split('    outline:')[1].split('    patternRegions:')[0]).not.toMatch(
      /\n {6}pattern:/,
    );
    expect(yaml).toContain('fullWall: true');
    const roundTrip = yamlCodec.decode(yaml);
    service.replaceData(roundTrip);
    expect(service.snapshot()).toEqual(saved);
    expect(service.wall('wall')!.patternRegions).toHaveLength(2);
    service.setPatternRegion('wall', 0, 'fullWall', false);
    expect(service.wall('wall')!.patternRegions[0]).toMatchObject({
      fullWall: false,
      x: -20,
      y: -10,
      width: 200,
      height: 100,
    });
    service.setOutlinePoints('wall', [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ]);
    expect(
      geometry.resolve(service.wall('wall')!, service.wall('wall')!.patternRegions[0]).width,
    ).toBe(200);
  });

  test('imports legacy SVG outline patterns into a full-wall region', () => {
    dom = new JSDOM('');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('DOMParser', dom.window.DOMParser);
    vi.stubGlobal('XMLSerializer', dom.window.XMLSerializer);
    const plan = svgCodec.decode(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="white"/></pattern><pattern id="wrapper" href="#grid" patternTransform="translate(3 -2) rotate(37)"/></defs><g class="wall" id="wall"><polygon class="outline" points="0,0 100,0 100,100" fill="url(#wrapper)"/></g></svg>`,
    );
    expect(plan.walls[0].patternRegions[0]).toMatchObject({
      fullWall: true,
      pattern: 'grid',
      patternX: 3,
      patternY: -2,
      patternRotation: 37,
    });
    expect(svgCodec.decode(svgCodec.encode(plan))).toEqual(plan);
  });
  test('rejects object values without corrupting saved pattern references or colors', () => {
    const saved = service.snapshot();
    expect(service.setOutlineValue('wall', 'pattern', { name: 'grid' })).toBe(false);
    expect(service.setPatternRegion('wall', 0, 'pattern', { name: 'grid' })).toBe(false);
    expect(service.setPatternValue('grid', 'tileColor', { color: '#ffffff' })).toBe(false);
    expect(service.snapshot()).toEqual(saved);
    expect(yamlCodec.decode(yamlCodec.encode(saved))).toEqual(saved);
  });

  test('defaults to zero rotation and inset', () => {
    expect(service.wall('wall')!.outline).not.toHaveProperty('patternRotation');
    expect(service.wall('wall')!.patternRegions[0].fullWall).toBe(true);
    expect(service.wall('wall')!.outline.patternInset).toBe(0);
    expect(service.wall('wall')!.patternRegions[0].patternRotation).toBe(0);
  });

  test('edits and saves wall and region rotation', () => {
    service.setPatternRegion('wall', 0, 'patternRotation', 37);
    service.setPatternRegion('wall', 1, 'patternRotation', 123);
    const saved = service.snapshot();
    expect(saved.walls[0].patternRegions[0].patternRotation).toBe(37);
    expect(saved.walls[0].patternRegions[1].patternRotation).toBe(123);
    expect(yamlCodec.decode(yamlCodec.encode(saved))).toEqual(saved);
  });

  test('validates perimeter inset edits', () => {
    expect(service.setOutlineValue('wall', 'patternInset', 5)).toBe(true);
    expect(service.wall('wall')!.outline.patternInset).toBe(5);
    expect(service.setOutlineValue('wall', 'patternInset', Infinity)).toBe(false);
    expect(service.wall('wall')!.outline.patternInset).toBe(5);
    expect(service.setOutlineValue('wall', 'patternInset', -2)).toBe(true);
    expect(service.wall('wall')!.outline.patternInset).toBe(0);
  });

  test.each(['grid', ''])('round trips complete YAML/SVG settings with pattern "%s"', (pattern) => {
    service.setPatternRegion('wall', 0, 'pattern', pattern);
    service.setPatternRegion('wall', 0, 'patternRotation', 37);
    service.setPatternRegion('wall', 1, 'patternRotation', 123);
    service.setOutlineValue('wall', 'patternInset', 5);
    service.setPatternRegion('wall', 0, 'patternX', 3);
    service.setPatternRegion('wall', 0, 'patternY', -2);
    service.setPatternRegion('wall', 1, 'patternX', -4);
    service.setPatternRegion('wall', 1, 'patternY', 7);
    service.setOutlineValue('wall', 'fill', '#eeeecc');
    service.setOutlineValue('wall', 'stroke', '#123456');
    service.setOutlineValue('wall', 'strokeWidth', 2);
    const saved = service.snapshot();
    expect(yamlCodec.decode(yamlCodec.encode(saved))).toEqual(saved);
    dom = new JSDOM('');
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('DOMParser', dom.window.DOMParser);
    vi.stubGlobal('XMLSerializer', dom.window.XMLSerializer);
    const svg = svgCodec.encode(saved);
    expect(svgCodec.decode(svg)).toEqual(saved);
    const parsed = new dom.window.DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector<HTMLElement>('mask polygon')!.getAttribute('stroke-width')).toBe(
      '10',
    );
    expect(parsed.querySelector<HTMLElement>('mask polygon')!.getAttribute('stroke-linejoin')).toBe(
      'miter',
    );
    if (pattern)
      expect(
        parsed
          .querySelector<HTMLElement>('pattern[href="#grid"]')!
          .getAttribute('patternTransform'),
      ).toBe('translate(8 3) rotate(37)');
    expect(
      parsed
        .querySelector<HTMLElement>('pattern[id$="region-1"]')!
        .getAttribute('patternTransform'),
    ).toBe('translate(1 12) rotate(123)');
    expect(
      parsed.querySelector<HTMLElement>('g[mask] rect:last-child')!.getAttribute('width'),
    ).toBe('20');
  });
});
