import type { Point } from '../model/types';

/** Removes a polygon's perimeter band with sharp joins, matching an SVG miter stroke. */
export class PerimeterClipper {
  public readonly miterLimit = 10;

  public bands(points: Point[], inset: number): Point[][] {
    if (!(inset > 0) || points.length < 3) return [];
    const vertices = points.filter((point, index) => {
      const next = points[(index + 1) % points.length];
      return point[0] !== next[0] || point[1] !== next[1];
    });
    if (vertices.length < 3) return [];
    const normals = vertices.map(([x, y], index): Point => {
      const [nx, ny] = vertices[(index + 1) % vertices.length];
      const length = Math.hypot(nx - x, ny - y);
      return [-(ny - y) / length, (nx - x) / length];
    });
    const bands: Point[][] = [];
    vertices.forEach(([x, y], index) => {
      const [bx, by] = vertices[(index + 1) % vertices.length];
      const [nx, ny] = normals[index];
      bands.push([
        [x + nx * inset, y + ny * inset],
        [bx + nx * inset, by + ny * inset],
        [bx - nx * inset, by - ny * inset],
        [x - nx * inset, y - ny * inset],
      ]);
      const [px, py] = normals[(index + vertices.length - 1) % vertices.length];
      const denominator = 1 + px * nx + py * ny;
      for (const sign of [-1, 1]) {
        const join: Point[] = [
          [x, y],
          [x + px * inset * sign, y + py * inset * sign],
        ];
        if (denominator > 1e-12) {
          const mx = ((px + nx) * inset * sign) / denominator;
          const my = ((py + ny) * inset * sign) / denominator;
          if (Math.hypot(mx, my) <= inset * this.miterLimit) join.push([x + mx, y + my]);
        }
        // Extremely acute joins bevel, keeping clipping finite and matching SVG's limit.
        join.push([x + nx * inset * sign, y + ny * inset * sign]);
        bands.push(join);
      }
    });
    return bands;
  }

  public clip(ctx: CanvasRenderingContext2D, points: Point[], inset: number) {
    const bands = this.bands(points, inset);
    if (!bands.length) return;
    const xs = points.map(([x]) => x),
      ys = points.map(([, y]) => y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys);
    const padding = inset * this.miterLimit * 2;
    for (const band of bands) {
      const path = new Path2D();
      path.rect(
        minX - padding,
        minY - padding,
        Math.max(...xs) - minX + padding * 2,
        Math.max(...ys) - minY + padding * 2,
      );
      path.moveTo(...band[0]);
      for (const point of band.slice(1)) path.lineTo(...point);
      path.closePath();
      // Separate intersections remove the union of bands without overlap leaks.
      ctx.clip(path, 'evenodd');
    }
  }
}
