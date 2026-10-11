import { PlanNormalizer } from '../model/plan-normalizer';
import type { Plan, Point, PlanInput, WallInput } from '../model/types';
import { number } from './format';
import { Transform2D } from './transform';
import { textureRotationQuarter } from '../rendering/texture-rotation';
import { PerimeterClipper } from '../rendering/perimeter-clipper';

/**
 * Imports and exports SVG documents using the editor's plan-specific conventions.
 * Uses PlanNormalizer for model defaults and Transform2D for supported transforms.
 * Checks imported SVG structure and rejects scripts and inline event handlers.
 * Export derives the view box from geometry; validateRoundTrip compares supported fields.
 */
export class SvgCodec {
  constructor(
    private normalizer = new PlanNormalizer(),
    private transform = new Transform2D(),
  ) {}
  private formatXml(xmlText: string) {
    const tokens = xmlText.replace(/>\s*</g, '><').trim().replace(/</g, '\n<').trim().split('\n');
    let depth = 0;
    const lines = [];
    for (const raw of tokens) {
      const token = raw.trim();
      if (!token) continue;
      if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
      lines.push('  '.repeat(depth) + token);
      if (/^<[^!?/][^>]*>$/.test(token) && !/\/>$/.test(token) && !/^<[^>]+>.*<\//.test(token))
        depth++;
    }
    return lines.join('\n');
  }
  public decode(input: string): Plan {
    const root =
      typeof input === 'string'
        ? new DOMParser().parseFromString(input, 'image/svg+xml').documentElement
        : input;
    if (!root || root.localName !== 'svg' || root.querySelector('parsererror'))
      throw new Error('Invalid SVG plan.');
    if (
      root.querySelector('script, foreignObject') ||
      [...root.querySelectorAll('*')].some((el) =>
        [...el.attributes].some((a) => /^on/i.test(a.name)),
      )
    )
      throw new Error('Scripts and inline event handlers are not allowed.');
    const numeric = (v: string | null | undefined, f = 0) => {
      const n = Number.parseFloat(String(v ?? ''));
      return Number.isFinite(n) ? n : f;
    };
    const parsePoints = (v: string | null | undefined): Point[] =>
      String(v ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((pair) => pair.split(',').map(Number))
        .filter((p): p is Point => p.length === 2 && p.every(Number.isFinite));
    const byId = (id: string) =>
      [...root.querySelectorAll('[id]')].find((n) => n.id === id) || null;
    const vb = (root.getAttribute('viewBox') || '0 0 0 0')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0)
      throw new Error('SVG needs a valid viewBox.');
    const allPatterns = [...root.querySelectorAll('pattern[id]')];
    const definitions = allPatterns.filter(
      (p) =>
        p.id === 'tile-pattern' ||
        p.hasAttribute('data-tile-definition') ||
        p.querySelector(':scope > rect[data-tile]') ||
        (!p.getAttribute('href') &&
          !p.getAttribute('xlink:href') &&
          p.querySelector(':scope > rect')),
    );
    const patterns = definitions.map((p) => {
      const tile = p.querySelector(':scope > rect[data-tile]') || p.querySelector(':scope > rect');
      const background = p.querySelector(':scope > rect[data-border]');
      const tileWidth = numeric(tile?.getAttribute('width'));
      const tileHeight = numeric(tile?.getAttribute('height'));
      const repeatCols = Math.max(1, numeric(p.getAttribute('data-repeat-cols'), 1));
      const patternWidth = numeric(p.getAttribute('width'), tileWidth) / repeatCols;
      const widthGap = Math.max(0, patternWidth - tileWidth);
      const borderSize = widthGap;
      const texture = p.querySelector(':scope > image[data-tile-texture]');
      return {
        name: p.id,
        tileWidth,
        tileHeight,
        borderSize,
        tileColor: tile?.getAttribute('fill') || '#ffffff',
        borderColor: background?.getAttribute('fill') || tile?.getAttribute('stroke') || '#888888',
        tileTexture: texture?.getAttribute('href') || texture?.getAttribute('xlink:href') || '',
        randomTextureRotation: p.getAttribute('data-random-texture-rotation') === 'true',
      };
    });
    const walls = [...root.querySelectorAll('g.wall')].map((w) => {
      const [x, y] = this.transform.translation(w),
        outline = w.querySelector(':scope > polygon.outline');
      const fill = outline?.getAttribute('fill') || '';
      const m = fill.match(/^url\(#(.+)\)$/);
      const ref = m?.[1] || outline?.getAttribute('data-pattern-ref') || '';
      const wrapper = ref ? byId(ref) : null;
      const href = wrapper?.getAttribute('href') || wrapper?.getAttribute('xlink:href') || '';
      const pattern = href.startsWith('#')
        ? href.slice(1)
        : definitions.some((p) => p.id === ref)
          ? ref
          : '';
      const [renderX, renderY] = wrapper
        ? this.transform.translation(wrapper, 'patternTransform')
        : [
            numeric(outline?.getAttribute('data-pattern-x')),
            numeric(outline?.getAttribute('data-pattern-y')),
          ];
      const patternX = outline?.hasAttribute('data-pattern-x')
        ? numeric(outline.getAttribute('data-pattern-x'))
        : renderX;
      const patternY = outline?.hasAttribute('data-pattern-y')
        ? numeric(outline.getAttribute('data-pattern-y'))
        : renderY;
      const patternRotation = wrapper
        ? this.transform.rotation(wrapper, 'patternTransform')
        : numeric(outline?.getAttribute('data-pattern-rotation'));
      return {
        name: w.id || w.getAttribute('name') || '',
        x,
        y,
        rotation: this.transform.rotation(w),
        placement3d: (() => {
          try {
            return JSON.parse(
              w.getAttribute('data-placement-3d') || 'null',
            ) as WallInput['placement3d'];
          } catch {
            return null;
          }
        })(),
        outline: {
          points: parsePoints(outline?.getAttribute('points')),
          pattern,
          patternX,
          patternY,
          patternRotation,
          patternInset: numeric(outline?.getAttribute('data-pattern-inset')),
          fill:
            outline?.getAttribute('data-base-fill') ||
            (pattern ? 'white' : outline?.getAttribute('fill') || 'white'),
          stroke: outline?.getAttribute('stroke') || '',
          strokeWidth: numeric(outline?.getAttribute('stroke-width'), 1),
        },
        patternRegions: (() => {
          try {
            return JSON.parse(
              w.getAttribute('data-pattern-regions') || '[]',
            ) as WallInput['patternRegions'];
          } catch {
            throw new Error('Invalid SVG pattern regions.');
          }
        })(),
        objects: [...w.querySelectorAll(':scope > rect.obj')].map((o) => {
          const [tx, ty] = this.transform.translation(o);
          return {
            name: o.getAttribute('name') || '',
            x: numeric(o.getAttribute('x')) + tx,
            y: numeric(o.getAttribute('y')) + ty,
            width: numeric(o.getAttribute('width')),
            height: numeric(o.getAttribute('height')),
            depth: numeric(o.getAttribute('data-depth'), 10),
            fill: o.getAttribute('fill') || '',
          };
        }),
      };
    });
    return this.normalizer.normalizeData({
      upAxis3d: root.getAttribute('data-up-axis-3d') || undefined,
      lights3d: (() => {
        try {
          return JSON.parse(root.getAttribute('data-lights-3d') || 'null') as PlanInput['lights3d'];
        } catch {
          return undefined;
        }
      })(),
      light3d: (() => {
        try {
          return JSON.parse(root.getAttribute('data-light-3d') || 'null') as PlanInput['light3d'];
        } catch {
          return undefined;
        }
      })(),
      name:
        root.getAttribute('data-plan-name') ||
        root.querySelector(':scope > title')?.textContent?.trim() ||
        'Tiling plan',
      units: 'mm',
      patterns,
      walls,
    });
  }

  public encode(planInput: Plan) {
    const plan = planInput,
      canvas = this.normalizer.canvasFromWalls(plan.walls),
      ns = 'http://www.w3.org/2000/svg',
      doc = document.implementation.createDocument(ns, 'svg', null),
      svg = doc.documentElement;
    svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', ns);
    svg.setAttribute('data-up-axis-3d', 'z');
    svg.setAttribute('data-lights-3d', JSON.stringify(plan.lights3d));
    svg.setAttribute('data-plan-name', plan.name);
    svg.setAttribute(
      'viewBox',
      [canvas.x, canvas.y, canvas.width, canvas.height].map(number).join(' '),
    );
    svg.setAttribute('width', `${number(canvas.width)}${plan.units}`);
    svg.setAttribute('height', `${number(canvas.height)}${plan.units}`);
    const defs = doc.createElementNS(ns, 'defs');
    svg.append(defs);
    for (const p of plan.patterns) {
      const cellWidth = p.tileWidth + p.borderSize,
        cellHeight = p.tileHeight + p.borderSize;
      const repeat = p.tileTexture && p.randomTextureRotation ? 4 : 1;
      const patternWidth = cellWidth * repeat,
        patternHeight = cellHeight * repeat;
      const pat = doc.createElementNS(ns, 'pattern');
      pat.id = p.name;
      pat.setAttribute('width', number(patternWidth));
      pat.setAttribute('height', number(patternHeight));
      pat.setAttribute('patternUnits', 'userSpaceOnUse');
      if (p.name !== 'tile-pattern') pat.setAttribute('data-tile-definition', 'true');
      if (repeat > 1) {
        pat.setAttribute('data-repeat-cols', String(repeat));
        pat.setAttribute('data-repeat-rows', String(repeat));
        pat.setAttribute('data-random-texture-rotation', 'true');
      }
      const border = doc.createElementNS(ns, 'rect');
      border.setAttribute('data-border', 'true');
      border.setAttribute('x', '0');
      border.setAttribute('y', '0');
      border.setAttribute('width', number(patternWidth));
      border.setAttribute('height', number(patternHeight));
      border.setAttribute('fill', p.borderColor || '#888888');
      pat.append(border);
      for (let row = 0; row < repeat; row++) {
        for (let col = 0; col < repeat; col++) {
          const x = col * cellWidth,
            y = row * cellHeight;
          const tile = doc.createElementNS(ns, 'rect');
          tile.setAttribute('data-tile', 'true');
          tile.setAttribute('x', number(x));
          tile.setAttribute('y', number(y));
          tile.setAttribute('width', number(p.tileWidth));
          tile.setAttribute('height', number(p.tileHeight));
          tile.setAttribute('fill', p.tileColor || '#ffffff');
          pat.append(tile);
          if (p.tileTexture) {
            const image = doc.createElementNS(ns, 'image');
            image.setAttribute('data-tile-texture', 'true');
            const rotation = p.randomTextureRotation ? textureRotationQuarter(col, row) : 0;
            const quarter = rotation % 2;
            const drawWidth = quarter ? p.tileHeight : p.tileWidth,
              drawHeight = quarter ? p.tileWidth : p.tileHeight;
            image.setAttribute('x', number(-drawWidth / 2));
            image.setAttribute('y', number(-drawHeight / 2));
            image.setAttribute('width', number(drawWidth));
            image.setAttribute('height', number(drawHeight));
            image.setAttribute('preserveAspectRatio', 'none');
            image.setAttribute('href', p.tileTexture);
            image.setAttribute(
              'transform',
              `translate(${number(x + p.tileWidth / 2)} ${number(y + p.tileHeight / 2)}) rotate(${rotation * 90})`,
            );
            pat.append(image);
          }
        }
      }
      defs.append(pat);
    }
    const drawing = doc.createElementNS(ns, 'g');
    drawing.id = 'flipped-drawing';
    drawing.setAttribute('transform', `translate(0 ${number(canvas.flipY)}) scale(1 -1)`);
    svg.append(drawing);
    for (const w of plan.walls) {
      const g = doc.createElementNS(ns, 'g');
      g.id = w.name;
      g.setAttribute('data-pattern-regions', JSON.stringify(w.patternRegions));
      if (w.placement3d) g.setAttribute('data-placement-3d', JSON.stringify(w.placement3d));
      g.setAttribute('class', 'wall');
      g.setAttribute(
        'transform',
        `translate(${number(w.x)} ${number(w.y)}) rotate(${number(w.rotation)})`,
      );
      const poly = doc.createElementNS(ns, 'polygon');
      poly.setAttribute('class', 'outline');
      poly.setAttribute('data-pattern-inset', number(w.outline.patternInset));
      poly.setAttribute('data-base-fill', w.outline.fill);
      poly.setAttribute('data-pattern-x', number(w.outline.patternX));
      poly.setAttribute('data-pattern-y', number(w.outline.patternY));
      poly.setAttribute('data-pattern-rotation', number(w.outline.patternRotation));
      poly.setAttribute(
        'points',
        w.outline.points.map((p) => `${number(p[0])},${number(p[1])}`).join(' '),
      );
      if (w.outline.pattern) {
        let pid = `${w.name}-tile-pattern`,
          n = 2;
        while ([...defs.querySelectorAll('pattern[id]')].some((p) => p.id === pid))
          pid = `${w.name}-tile-pattern-${n++}`;
        const wrap = doc.createElementNS(ns, 'pattern');
        wrap.id = pid;
        wrap.setAttribute('href', `#${w.outline.pattern}`);
        wrap.setAttribute(
          'patternTransform',
          `translate(${number(w.outline.patternX + w.outline.patternInset)} ${number(w.outline.patternY + w.outline.patternInset)}) rotate(${number(w.outline.patternRotation || 0)})`,
        );
        defs.append(wrap);
        poly.setAttribute('fill', `url(#${pid})`);
      } else poly.setAttribute('fill', w.outline.fill || 'white');
      if (w.outline.stroke) poly.setAttribute('stroke', w.outline.stroke);
      poly.setAttribute('stroke-width', number(w.outline.strokeWidth));
      g.append(poly);
      const patterned = doc.createElementNS(ns, 'g');
      if (w.outline.patternInset > 0) {
        let maskId = 'perimeter-mask-' + plan.walls.indexOf(w);
        while (
          plan.patterns.some((p) => p.name === maskId) ||
          plan.walls.some((wall) => wall.name === maskId) ||
          [...defs.querySelectorAll('[id]')].some((el) => el.id === maskId)
        )
          maskId += '-';
        const mask = doc.createElementNS(ns, 'mask');
        mask.id = maskId;
        mask.setAttribute('maskUnits', 'userSpaceOnUse');
        const xs = w.outline.points.map(([x]) => x),
          ys = w.outline.points.map(([, y]) => y);
        mask.setAttribute('x', number(Math.min(...xs)));
        mask.setAttribute('y', number(Math.min(...ys)));
        mask.setAttribute('width', number(Math.max(...xs) - Math.min(...xs)));
        mask.setAttribute('height', number(Math.max(...ys) - Math.min(...ys)));
        const shape = doc.createElementNS(ns, 'polygon');
        shape.setAttribute('points', poly.getAttribute('points')!);
        shape.setAttribute('fill', 'white');
        shape.setAttribute('stroke', 'black');
        shape.setAttribute('stroke-width', number(w.outline.patternInset * 2));
        shape.setAttribute('stroke-linejoin', 'miter');
        shape.setAttribute('stroke-miterlimit', String(new PerimeterClipper().miterLimit));
        mask.append(shape);
        defs.append(mask);
        patterned.setAttribute('mask', `url(#${maskId})`);
        if (w.outline.pattern) {
          const tiles = poly.cloneNode(true) as Element;
          tiles.removeAttribute('class');
          tiles.removeAttribute('stroke');
          patterned.append(tiles);
          poly.setAttribute('data-pattern-ref', poly.getAttribute('fill')!.slice(5, -1));
          poly.setAttribute('fill', w.outline.fill || 'white');
        }
      }
      const clip = doc.createElementNS(ns, 'clipPath');
      let clipId = 'surface-clip-' + plan.walls.indexOf(w);
      while (
        plan.patterns.some((p) => p.name === clipId) ||
        plan.walls.some((wall) => wall.name === clipId) ||
        [...defs.querySelectorAll('[id]')].some((el) => el.id === clipId)
      )
        clipId += '-';
      clip.id = clipId;
      const clipShape = doc.createElementNS(ns, 'polygon');
      clipShape.setAttribute('points', poly.getAttribute('points')!);
      clip.append(clipShape);
      defs.append(clip);
      patterned.setAttribute('clip-path', `url(#${clipId})`);
      for (const [index, region] of w.patternRegions.entries()) {
        if (!region.pattern || !(region.width > 0 && region.height > 0)) continue;
        const wrap = doc.createElementNS(ns, 'pattern');
        let id = `${clipId}-region-${index}`;
        while (
          [...defs.querySelectorAll('[id]')].some((el) => el.id === id) ||
          plan.patterns.some((p) => p.name === id) ||
          plan.walls.some((wall) => wall.name === id)
        )
          id += '-';
        wrap.id = id;
        wrap.setAttribute('href', `#${region.pattern}`);
        wrap.setAttribute(
          'patternTransform',
          `translate(${number(region.patternX + w.outline.patternInset)} ${number(region.patternY + w.outline.patternInset)}) rotate(${number(region.patternRotation)})`,
        );
        defs.append(wrap);
        const rect = doc.createElementNS(ns, 'rect');
        for (const key of ['x', 'y', 'width', 'height'] as const)
          rect.setAttribute(key, number(region[key]));
        rect.setAttribute('fill', `url(#${id})`);
        patterned.append(rect);
      }
      g.append(patterned);
      // Keep the outline stroke above region overlays.
      if (w.outline.stroke) {
        const border = poly.cloneNode(true) as Element;
        border.removeAttribute('class');
        border.setAttribute('fill', 'none');
        g.append(border);
      }
      for (const o of w.objects) {
        const r = doc.createElementNS(ns, 'rect');
        r.setAttribute('class', 'obj');
        r.setAttribute('data-depth', number(o.depth || 10));
        r.setAttribute('name', o.name);
        r.setAttribute('x', '0');
        r.setAttribute('y', '0');
        r.setAttribute('transform', `translate(${number(o.x)} ${number(o.y)})`);
        r.setAttribute('width', number(o.width));
        r.setAttribute('height', number(o.height));
        r.setAttribute('fill', o.fill || 'red');
        r.setAttribute('fill-opacity', '0.2');
        g.append(r);
      }
      drawing.append(g);
    }
    return this.formatXml(new XMLSerializer().serializeToString(svg));
  }
  private snapshot(planInput: Plan) {
    const plan = planInput;
    return {
      name: plan.name,
      lights3d: plan.lights3d.map((light) => ({ ...light })),
      units: plan.units,
      canvas: { ...plan.canvas },
      patterns: plan.patterns.map((pattern) => ({ ...pattern })),
      walls: plan.walls.map((wall) => ({
        name: wall.name,
        x: wall.x,
        y: wall.y,
        rotation: wall.rotation,
        placement3d: wall.placement3d,
        patternRegions: wall.patternRegions.map((region) => ({ ...region })),
        outline: {
          ...wall.outline,
          points: wall.outline.points.map((point) => [...point]),
        },
        objects: wall.objects.map((object) => ({ ...object })),
      })),
    };
  }

  public validateRoundTrip(input: string) {
    const first = this.decode(input);
    const encoded = this.encode(first);
    const second = this.decode(encoded);
    const before = this.snapshot(first);
    const after = this.snapshot(second);
    const equal = JSON.stringify(before) === JSON.stringify(after);
    return { equal, before, after, encoded };
  }
}
