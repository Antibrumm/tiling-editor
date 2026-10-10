import type { Plan, Wall, Position } from './types';

/**
 * Provides geometry calculations without changing plan data.
 * Computes rotated plan bounds, converts world points to local coordinates, and tests
 * polygon containment and intersections. Coordinates use the plan's millimeter units.
 */
export class GeometryTools {
  public planBounds(planInput: Plan) {
    const plan = planInput;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const include = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    const transform = (wall: Wall, x: number, y: number) => {
      const angle = (wall.rotation * Math.PI) / 180;
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      return {
        x: wall.x + x * cos - y * sin,
        y: wall.y + x * sin + y * cos,
      };
    };
    for (const wall of plan.walls) {
      for (const point of wall.outline.points) {
        const world = transform(wall, point[0], point[1]);
        include(world.x, world.y);
      }
      for (const object of wall.objects) {
        for (const [x, y] of [
          [object.x, object.y],
          [object.x + object.width, object.y],
          [object.x + object.width, object.y + object.height],
          [object.x, object.y + object.height],
        ]) {
          const world = transform(wall, x, y);
          include(world.x, world.y);
        }
      }
    }
    return [minX, minY, maxX, maxY].every(Number.isFinite) ? { minX, minY, maxX, maxY } : null;
  }
  public worldToLocal(point: Position, transform: { x: number; y: number; rotation?: number }) {
    const dx = point.x - (transform.x || 0);
    const dy = point.y - (transform.y || 0);
    const angle = (-(transform.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }
  public pointInPolygon(p: Position, pts: Position[]) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i],
        b = pts[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
    return inside;
  }
  public pointOnSegment(p: Position, a: Position, b: Position, epsilon = 1e-7) {
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) > epsilon) return false;
    return (
      p.x >= Math.min(a.x, b.x) - epsilon &&
      p.x <= Math.max(a.x, b.x) + epsilon &&
      p.y >= Math.min(a.y, b.y) - epsilon &&
      p.y <= Math.max(a.y, b.y) + epsilon
    );
  }
  public pointInPolygonInclusive(p: Position, pts: Position[]) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (this.pointOnSegment(p, pts[j], pts[i])) return true;
    }
    return this.pointInPolygon(p, pts);
  }
  public segmentsProperlyIntersect(
    a: Position,
    b: Position,
    c: Position,
    d: Position,
    epsilon = 1e-7,
  ) {
    const orient = (p: Position, q: Position, r: Position) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const o1 = orient(a, b, c),
      o2 = orient(a, b, d),
      o3 = orient(c, d, a),
      o4 = orient(c, d, b);
    return (
      ((o1 > epsilon && o2 < -epsilon) || (o1 < -epsilon && o2 > epsilon)) &&
      ((o3 > epsilon && o4 < -epsilon) || (o3 < -epsilon && o4 > epsilon))
    );
  }
  public rectangleInsidePolygon(
    x: number,
    y: number,
    width: number,
    height: number,
    polygon: Position[],
  ) {
    if (!polygon || polygon.length < 3) return false;
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    if (!corners.every((point) => this.pointInPolygonInclusive(point, polygon))) return false;
    const rectEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]]);
    for (let i = 0; i < polygon.length; i++) {
      const edge = [polygon[i], polygon[(i + 1) % polygon.length]];
      for (const rectEdge of rectEdges) {
        if (this.segmentsProperlyIntersect(rectEdge[0], rectEdge[1], edge[0], edge[1]))
          return false;
      }
    }
    return true;
  }
}
