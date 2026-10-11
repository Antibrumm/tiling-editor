import { ShapeUtils } from 'three/src/extras/ShapeUtils.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import type { Pattern, Point, Wall } from './types';
import { PerimeterClipper } from '../rendering/perimeter-clipper';

export interface TileCount {
  total: number;
  patterns: { name: string; count: number }[];
}

/** Counts distinct tile rectangles with positive area in the painted surface. */
export class TileCounter {
  private clipper = new PerimeterClipper();
  private cache = new Map<string, { key: string; result: TileCount | null }>();
  private work = 0;

  public count(wall: Wall, patterns: Pattern[]): TileCount | null {
    const key = JSON.stringify([
      wall.outline,
      wall.patternRegions,
      patterns.map(({ name, tileWidth, tileHeight, borderSize }) => [
        name,
        tileWidth,
        tileHeight,
        borderSize,
      ]),
    ]);
    const cached = this.cache.get(wall.name);
    if (cached?.key === key) return cached.result;
    this.work = 0;
    let result: TileCount | null;
    try {
      result = this.calculate(wall, patterns);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      result = null;
    }
    if (this.cache.size >= 128) this.cache.clear();
    this.cache.set(wall.name, { key, result });
    return result;
  }

  private calculate(wall: Wall, patterns: Pattern[]): TileCount {
    const points = wall.outline.points;
    let pieces = ShapeUtils.triangulateShape(
      points.map(([x, y]) => new Vector2(x, y)),
      [],
    ).map((indices) => indices.map((index) => points[index]));
    for (const band of this.clipper.bands(points, wall.outline.patternInset)) {
      if (this.area(band) <= 1e-8) continue;
      pieces = pieces.flatMap((piece) => this.subtract(piece, band));
    }
    const definitions = new Map(patterns.map((pattern) => [pattern.name, pattern]));
    const regions = wall.patternRegions.filter(
      (region) => region.width > 0 && region.height > 0 && definitions.has(region.pattern),
    );
    const masks = regions.map((region) =>
      this.rectangle(region.x, region.y, region.width, region.height),
    );
    const surfaces = [wall.outline, ...regions];
    const tiles = new Map<string, Set<string>>();
    surfaces.forEach((surface, index) => {
      const definition = definitions.get(surface.pattern);
      if (!definition || !(definition.tileWidth > 0 && definition.tileHeight > 0)) return;
      let visible = pieces;
      if (index > 0)
        visible = visible
          .map((piece) => this.intersect(piece, masks[index - 1]))
          .filter((piece) => this.area(piece) > 1e-8);
      for (const mask of masks.slice(index)) {
        visible = visible.flatMap((piece) => this.subtract(piece, mask));
      }
      const offsetX = surface.patternX + wall.outline.patternInset;
      const offsetY = surface.patternY + wall.outline.patternInset;
      const angle = (surface.patternRotation * Math.PI) / 180;
      const cosine = Math.cos(angle),
        sine = Math.sin(angle);
      const grid = visible.map((piece) =>
        piece.map(([x, y]): Point => [
          (x - offsetX) * cosine + (y - offsetY) * sine,
          -(x - offsetX) * sine + (y - offsetY) * cosine,
        ]),
      );
      const width = definition.tileWidth + definition.borderSize;
      const height = definition.tileHeight + definition.borderSize;
      if (!(width > 0 && height > 0)) return;
      const counted = tiles.get(definition.name) || new Set<string>();
      tiles.set(definition.name, counted);
      const placement = JSON.stringify([offsetX, offsetY, surface.patternRotation % 360]);
      for (const polygon of grid) {
        const xs = polygon.map(([x]) => x),
          ys = polygon.map(([, y]) => y);
        const minColumn = Math.floor(Math.min(...xs) / width),
          maxColumn = Math.ceil(Math.max(...xs) / width) - 1;
        const minRow = Math.floor(Math.min(...ys) / height),
          maxRow = Math.ceil(Math.max(...ys) / height) - 1;
        if ((maxColumn - minColumn + 1) * (maxRow - minRow + 1) > 100000)
          throw new RangeError('Tile count exceeds work limit');
        for (let column = minColumn; column <= maxColumn; column++) {
          for (let row = minRow; row <= maxRow; row++) {
            const id = `${placement}:${column}:${row}`;
            this.budget();
            if (
              !counted.has(id) &&
              this.area(
                this.intersect(
                  polygon,
                  this.rectangle(
                    column * width,
                    row * height,
                    definition.tileWidth,
                    definition.tileHeight,
                  ),
                ),
              ) > 1e-8
            )
              counted.add(id);
          }
        }
      }
    });
    const breakdown = [...tiles].map(([name, ids]) => ({ name, count: ids.size }));
    return {
      total: breakdown.reduce((total, pattern) => total + pattern.count, 0),
      patterns: breakdown,
    };
  }

  private budget() {
    if (++this.work > 2000000) throw new RangeError('Tile count exceeds work limit');
  }

  private rectangle(x: number, y: number, width: number, height: number): Point[] {
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ];
  }

  private signedArea(points: Point[]): number {
    return (
      points.reduce((sum, [x, y], index) => {
        const next = points[(index + 1) % points.length];
        return sum + x * next[1] - y * next[0];
      }, 0) / 2
    );
  }

  private area(points: Point[]): number {
    return Math.abs(this.signedArea(points));
  }

  private halfPlane(points: Point[], a: Point, b: Point, sign: number): Point[] {
    const result: Point[] = [];
    const distance = ([x, y]: Point) =>
      sign * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]));
    points.forEach((point, index) => {
      this.budget();
      const next = points[(index + 1) % points.length];
      const d = distance(point),
        e = distance(next);
      if (d >= 0) result.push(point);
      if ((d > 0 && e < 0) || (d < 0 && e > 0)) {
        const fraction = d / (d - e);
        result.push([
          point[0] + fraction * (next[0] - point[0]),
          point[1] + fraction * (next[1] - point[1]),
        ]);
      }
    });
    return result;
  }

  private intersect(polygon: Point[], mask: Point[]): Point[] {
    const sign = this.signedArea(mask) >= 0 ? 1 : -1;
    for (let index = 0; index < mask.length && polygon.length; index++) {
      polygon = this.halfPlane(polygon, mask[index], mask[(index + 1) % mask.length], sign);
    }
    return polygon;
  }

  private subtract(polygon: Point[], mask: Point[]): Point[][] {
    const result: Point[][] = [];
    const sign = this.signedArea(mask) >= 0 ? 1 : -1;
    for (let index = 0; index < mask.length && polygon.length; index++) {
      const a = mask[index],
        b = mask[(index + 1) % mask.length];
      const outside = this.halfPlane(polygon, a, b, -sign);
      if (this.area(outside) > 1e-8) result.push(outside);
      polygon = this.halfPlane(polygon, a, b, sign);
    }
    return result;
  }
}
