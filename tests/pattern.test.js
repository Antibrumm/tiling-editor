import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { PlanService } from '../src/model/plan-service';
import { YamlCodec } from '../src/codecs/yaml';
import { SvgCodec } from '../src/codecs/svg';

let service;
let dom;
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
  test('rejects object values without corrupting saved pattern references or colors', () => {
    const saved = service.snapshot();
    expect(service.setOutlineValue('wall', 'pattern', { name: 'grid' })).toBe(false);
    expect(service.setPatternRegion('wall', 0, 'pattern', { name: 'grid' })).toBe(false);
    expect(service.setPatternValue('grid', 'tileColor', { color: '#ffffff' })).toBe(false);
    expect(service.snapshot()).toEqual(saved);
    expect(yamlCodec.decode(yamlCodec.encode(saved))).toEqual(saved);
  });

  test('defaults to zero rotation and inset', () => {
    expect(service.wall('wall').outline.patternRotation).toBe(0);
    expect(service.wall('wall').outline.patternInset).toBe(0);
    expect(service.wall('wall').patternRegions[0].patternRotation).toBe(0);
  });

  test('edits and saves wall and region rotation', () => {
    service.setOutlineValue('wall', 'patternRotation', 37);
    service.setPatternRegion('wall', 0, 'patternRotation', 123);
    const saved = service.snapshot();
    expect(saved.walls[0].outline.patternRotation).toBe(37);
    expect(saved.walls[0].patternRegions[0].patternRotation).toBe(123);
    expect(yamlCodec.decode(yamlCodec.encode(saved))).toEqual(saved);
  });

  test('validates perimeter inset edits', () => {
    expect(service.setOutlineValue('wall', 'patternInset', 5)).toBe(true);
    expect(service.wall('wall').outline.patternInset).toBe(5);
    expect(service.setOutlineValue('wall', 'patternInset', Infinity)).toBe(false);
    expect(service.wall('wall').outline.patternInset).toBe(5);
    expect(service.setOutlineValue('wall', 'patternInset', -2)).toBe(true);
    expect(service.wall('wall').outline.patternInset).toBe(0);
  });

  test.each(['grid', ''])('round trips complete YAML/SVG settings with pattern "%s"', (pattern) => {
    service.setOutlineValue('wall', 'pattern', pattern);
    service.setOutlineValue('wall', 'patternRotation', 37);
    service.setPatternRegion('wall', 0, 'patternRotation', 123);
    service.setOutlineValue('wall', 'patternInset', 5);
    service.setPatternTranslation('wall', 3, -2);
    service.setPatternRegion('wall', 0, 'patternX', -4);
    service.setPatternRegion('wall', 0, 'patternY', 7);
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
    expect(parsed.querySelector('mask polygon').getAttribute('stroke-width')).toBe('10');
    expect(parsed.querySelector('mask polygon').getAttribute('stroke-linejoin')).toBe('miter');
    if (pattern)
      expect(parsed.querySelector('pattern[href="#grid"]').getAttribute('patternTransform')).toBe(
        'translate(8 3) rotate(37)',
      );
    expect(parsed.querySelector('pattern[id*="region"]').getAttribute('patternTransform')).toBe(
      'translate(1 12) rotate(123)',
    );
    expect(parsed.querySelector('g[mask] rect').getAttribute('width')).toBe('20');
  });
});
