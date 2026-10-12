import { test, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PdfReport } from '../src/codecs/pdf-report';
import { PlanService } from '../src/model/plan-service';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=';
function contents(buffer) {
  const raw = Buffer.from(buffer).toString('latin1');
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((match) => {
      try {
        return inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('\n');
  return { raw, text: streams, pages: (raw.match(/\/Type \/Page\b/g) || []).length };
}
function plan(wallCount = 1) {
  return new PlanService({
    name: 'Bathroom PDF',
    patterns: [{ name: 'Ceramic', tileWidth: 500, tileHeight: 500, borderSize: 0 }],
    walls: Array.from({ length: wallCount }, (_, index) => ({
      name: `Wall ${index + 1}`,
      outline: {
        points: [
          [0, 0],
          [2000, 0],
          [2000, 1000],
          [0, 1000],
        ],
        pattern: 'Ceramic',
      },
    })),
  }).snapshot();
}
test('generates selectable room totals and region tables plus both preview pages', () => {
  const result = contents(new PdfReport().generate(plan(), image, image));
  expect(result.raw).toMatch(/^%PDF-/);
  expect(result.pages).toBe(3);
  for (const text of [
    'Bathroom PDF',
    'Complete room',
    'Ceramic',
    'Wall 1',
    'Tile region 1',
    '2D view',
    '3D preview',
    '2.00',
    '(8)',
  ])
    expect(result.text).toContain(text);
  expect(result.raw).toContain('/Subtype /Image');
});
test('paginates long reports and repeats table headers without losing final walls', () => {
  const data = plan();
  data.walls[0].patternRegions = Array.from({ length: 100 }, (_, index) => ({
    fullWall: false,
    x: index * 10,
    y: 0,
    width: 10,
    height: 1000,
    pattern: 'Ceramic',
    patternX: 0,
    patternY: 0,
    patternRotation: 0,
  }));
  const result = contents(new PdfReport().generate(data, image, image));
  expect(result.pages).toBeGreaterThan(4);
  expect(result.text).toContain('Tile region 100');
  expect((result.text.match(/Selected tile/g) || []).length).toBeGreaterThan(1);
});
test('supports empty plans and unavailable WebGL without dropping the 3D page', () => {
  const result = contents(new PdfReport().generate(new PlanService().snapshot(), image, null));
  expect(result.pages).toBe(3);
  expect(result.text).toContain('No walls or tile regions.');
  expect(result.text).toContain('3D preview is unavailable');
});
