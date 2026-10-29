import { test, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PdfReport } from '../src/codecs/pdf-report';
import { PlanService } from '../src/model/plan-service';

const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=';
function contents(buffer: ArrayBuffer) {
  const raw = Buffer.from(buffer).toString('latin1');
  const objects = new Map(
    [...raw.matchAll(/(?:^|\n)(\d+) 0 obj\r?\n([\s\S]*?)\r?\nendobj/g)].map((match) => [
      Number(match[1]),
      match[2],
    ]),
  );
  const catalog = [...objects.values()].find((object) => object.includes('/Type /Catalog')) || '';
  const pageTreeId = Number(catalog.match(/\/Pages (\d+) 0 R/)?.[1]);
  const pageTree = objects.get(pageTreeId) || '';
  const pageIds = [
    ...(pageTree.match(/\/Kids \[([^\]]*)\]/)?.[1] || '').matchAll(/(\d+) 0 R/g),
  ].map((match) => Number(match[1]));
  const pageTexts = pageIds.map((pageId) => {
    const page = objects.get(pageId) || '';
    const contentId = Number(page.match(/\/Contents (\d+) 0 R/)?.[1]);
    const stream = objects.get(contentId)?.match(/stream\r?\n([\s\S]*?)\r?\nendstream/)?.[1];
    try {
      return stream ? inflateSync(Buffer.from(stream, 'latin1')).toString('latin1') : '';
    } catch {
      return '';
    }
  });
  return {
    raw,
    text: pageTexts.join('\n'),
    pageTexts,
    pages: (raw.match(/\/Type \/Page\b/g) || []).length,
  };
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
test('stacks caption-free room previews on the opening page with 3D first', () => {
  const result = contents(new PdfReport().generate(plan(), image, image, [image]));
  expect(result.raw).toMatch(/^%PDF-/);
  expect(result.pages).toBe(3);
  for (const text of [
    'Bathroom PDF',
    'Complete room',
    'Ceramic',
    'Wall 1',
    'Tile region 1',
    'Wall 1',
    '2.00',
    '(8)',
  ])
    expect(result.text).toContain(text);
  expect(result.raw).toContain('/Subtype /Image');
  const openingPage = result.pageTexts[0];
  expect(openingPage).not.toContain('3D preview');
  expect(openingPage).not.toContain('2D view');
  expect((openingPage.match(/\/I\d+ Do/g) || []).length).toBe(2);
});
test('adds each wall image before that wall’s tiling details', () => {
  const data = plan(2);
  const result = contents(new PdfReport().generate(data, image, image, [image, image]));
  expect(result.pages).toBe(4);
  expect(result.text).toContain('Wall 1');
  expect(result.text).toContain('Wall 2');
  const pageWith = (text: string) =>
    result.pageTexts.map((page) => page.includes(text)).lastIndexOf(true);
  expect(result.pageTexts[0]).not.toContain('Tile information');
  expect(pageWith('Tile information')).toBe(1);
  expect(pageWith('Tile information')).toBeLessThan(pageWith('Wall 1'));
  const wallOnePage = result.pageTexts[pageWith('Details: Wall 1')];
  const wallTwoPage = result.pageTexts[pageWith('Details: Wall 2')];
  expect(wallOnePage).toBeTruthy();
  expect(wallTwoPage).toBeTruthy();
  expect(wallOnePage.indexOf('Details: Wall 1')).toBeLessThan(wallOnePage.indexOf('Wall area:'));
  expect(wallOnePage.indexOf('Wall area:')).toBeLessThan(wallOnePage.indexOf('Tile region 1'));
  expect(wallTwoPage.indexOf('Details: Wall 2')).toBeLessThan(wallTwoPage.indexOf('Tile region 1'));
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
test('supports empty plans and unavailable WebGL on the opening page', () => {
  const result = contents(new PdfReport().generate(new PlanService().snapshot(), image, null));
  expect(result.pages).toBe(2);
  expect(result.text).toContain('No walls or tile regions.');
  expect(result.text).toContain('Preview unavailable in this browser.');
});
