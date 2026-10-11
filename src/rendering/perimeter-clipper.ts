import type { Point } from '../model/types';

/** Removes the distance band around every polygon edge, including concave corners. */
export class PerimeterClipper {
  public clip(ctx: CanvasRenderingContext2D, points: Point[], inset: number) {
    if (!(inset > 0) || points.length < 3) return;
    const xs = points.map(([x]) => x),
      ys = points.map(([, y]) => y);
    const minX = Math.min(...xs),
      minY = Math.min(...ys);
    const width = Math.max(...xs) - minX,
      height = Math.max(...ys) - minY;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i],
        [bx, by] = points[(i + 1) % points.length];
      const angle = Math.atan2(by - ay, bx - ax);
      const nx = -Math.sin(angle) * inset,
        ny = Math.cos(angle) * inset;
      const path = new Path2D();
      path.rect(minX - inset * 2, minY - inset * 2, width + inset * 4, height + inset * 4);
      path.moveTo(ax + nx, ay + ny);
      path.lineTo(bx + nx, by + ny);
      path.arc(bx, by, inset, angle + Math.PI / 2, angle - Math.PI / 2, true);
      path.lineTo(ax - nx, ay - ny);
      path.arc(ax, ay, inset, angle - Math.PI / 2, angle - Math.PI * 1.5, true);
      path.closePath();
      // Intersect complements separately so overlapping edge bands never create holes.
      ctx.clip(path, 'evenodd');
    }
  }
}
