import type {
  Plan,
  PlanInput,
  Input,
  CanvasBounds,
  Pattern,
  PatternInput,
  Point,
  Position,
  PatternRegion,
  PlanObject,
  Placement,
  Wall,
  WallInput,
  Light,
} from './types';
import { ScenePlacement } from './scene-placement';
/**
 * Converts partial plan input into complete model data with consistent defaults.
 * Coerces supported fields, derives canvas bounds, and migrates legacy light and Y-up data.
 * Uses ScenePlacement to calculate default light aims. Normalization does not replace
 * the domain checks performed by PlanService mutations and document codecs.
 */
export class PlanNormalizer {
  constructor(private placement = new ScenePlacement()) {}
  public finite(value: unknown, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  public normalizeCanvas(canvas: Input<CanvasBounds> = {}): CanvasBounds {
    return {
      x: this.finite(canvas.x),
      y: this.finite(canvas.y),
      width: this.finite(canvas.width),
      height: this.finite(canvas.height),
      flipY: this.finite(canvas.flipY, this.finite(canvas.y) + this.finite(canvas.height)),
    };
  }
  public normalizePattern(pattern: PatternInput = {}): Pattern {
    return {
      name: String(pattern.name ?? ''),
      tileWidth: this.finite(pattern.tileWidth),
      tileHeight: this.finite(pattern.tileHeight),
      borderSize: Math.max(
        0,
        this.finite(
          pattern.borderSize,
          Math.max(0, this.finite(pattern.patternWidth) - this.finite(pattern.tileWidth)),
        ),
      ),
      tileColor: String(pattern.tileColor ?? pattern.fill ?? '#ffffff'),
      borderColor: String(pattern.borderColor ?? pattern.stroke ?? '#888888'),
      tileTexture: String(pattern.tileTexture ?? ''),
      randomTextureRotation:
        pattern.randomTextureRotation === true ||
        String(pattern.randomTextureRotation).toLowerCase() === 'true',
    };
  }
  public normalizePoint(point: Point | Position): Point {
    if (Array.isArray(point)) return [this.finite(point[0]), this.finite(point[1])];
    return [this.finite(point?.x), this.finite(point?.y)];
  }
  public normalizePatternRegion(region: Input<PatternRegion> = {}): PatternRegion {
    return {
      x: this.finite(region.x),
      y: this.finite(region.y),
      width: Math.max(0, this.finite(region.width)),
      height: Math.max(0, this.finite(region.height)),
      pattern: String(region.pattern ?? ''),
      patternX: this.finite(region.patternX),
      patternY: this.finite(region.patternY),
      patternRotation: this.finite(region.patternRotation),
    };
  }
  public normalizeObject(object: Input<PlanObject> = {}): PlanObject {
    return {
      name: String(object.name ?? ''),
      x: this.finite(object.x),
      y: this.finite(object.y),
      width: this.finite(object.width),
      height: this.finite(object.height),
      fill: String(object.fill ?? ''),
      depth: Math.max(1, this.finite(object.depth, 10)),
    };
  }
  public floorAim(plan: Pick<Plan, 'walls'>) {
    const floor = this.placement.floor(plan),
      points = floor?.outline.points;
    if (!floor || !points?.length) return { aimX: 0, aimY: 0, aimZ: 0 };
    let area = 0,
      x = 0,
      y = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        cross = a[0] * b[1] - b[0] * a[1];
      area += cross;
      x += (a[0] + b[0]) * cross;
      y += (a[1] + b[1]) * cross;
    }
    if (Math.abs(area) > 1e-9) {
      x /= 3 * area;
      y /= 3 * area;
    } else {
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    const placement = this.placement.effective(plan, floor, plan.walls.indexOf(floor)),
      angle = (placement.yaw * Math.PI) / 180;
    const round = (value: number) => Math.round(value * 10000) / 10000;
    return {
      aimX: round(placement.x + x * Math.cos(angle) - y * Math.sin(angle)),
      aimY: round(placement.y + x * Math.sin(angle) + y * Math.cos(angle)),
      aimZ: round(placement.z),
    };
  }
  public normalizeLights(data: PlanInput, plan: Pick<Plan, 'walls'>): Light[] {
    const values = Array.isArray(data.lights3d) ? data.lights3d : [data.light3d || {}];
    const used = new Set(),
      aim = this.floorAim(plan);
    return values.map((value, index) => {
      if (!value || typeof value !== 'object') value = {};
      let id = String(value.id || 'light-' + (index + 1)),
        base = id,
        suffix = 2;
      while (used.has(id)) id = base + '-' + suffix++;
      used.add(id);
      return {
        id,
        x: this.finite(value.x, 5000),
        y: this.finite(value.y, -6000),
        z: this.finite(value.z, 9000),
        aimX: this.finite(value.aimX, aim.aimX),
        aimY: this.finite(value.aimY, aim.aimY),
        aimZ: this.finite(value.aimZ, aim.aimZ),
        color:
          typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color)
            ? value.color
            : '#ffffff',
        intensity: Math.max(0, this.finite(value.intensity, 2.5)),
      };
    });
  }
  public normalizePlacement(value: Input<Placement> | null | undefined): Placement | null {
    if (!value || typeof value !== 'object') return null;
    return {
      type: value.type === 'floor' ? 'floor' : 'wall',
      x: this.finite(value.x),
      y: this.finite(value.y),
      z: this.finite(value.z),
      yaw: this.finite(value.yaw),
    };
  }
  public normalizeWall(wall: WallInput = {}): Wall {
    const outline = wall.outline ?? {};
    return {
      name: String(wall.name ?? ''),
      x: this.finite(wall.x),
      y: this.finite(wall.y),
      rotation: this.finite(wall.rotation),
      placement3d: this.normalizePlacement(wall.placement3d),
      outline: {
        points: Array.isArray(outline.points)
          ? outline.points.map((value) => this.normalizePoint(value))
          : [],
        pattern: String(outline.pattern ?? ''),
        patternX: this.finite(outline.patternX),
        patternY: this.finite(outline.patternY),
        patternRotation: this.finite(outline.patternRotation),
        fill: String(outline.fill ?? 'white'),
        stroke: String(outline.stroke ?? ''),
        strokeWidth: this.finite(outline.strokeWidth, 1),
      },
      patternRegions: Array.isArray(wall.patternRegions)
        ? wall.patternRegions.map((value) => this.normalizePatternRegion(value))
        : [],
      objects: Array.isArray(wall.objects)
        ? wall.objects.map((value) => this.normalizeObject(value))
        : [],
    };
  }
  public canvasFromWalls(walls: Wall[] = []): CanvasBounds {
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
    for (const wall of walls) {
      const angle = (this.finite(wall.rotation) * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      const includeLocal = (x: number, y: number) =>
        include(wall.x + x * cos - y * sin, wall.y + x * sin + y * cos);
      for (const point of wall.outline?.points || []) includeLocal(point[0], point[1]);
      for (const object of wall.objects || [])
        for (const [x, y] of [
          [object.x, object.y],
          [object.x + object.width, object.y],
          [object.x + object.width, object.y + object.height],
          [object.x, object.y + object.height],
        ])
          includeLocal(x, y);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite))
      return { x: 0, y: 0, width: 0, height: 0, flipY: 0 };
    return {
      x: minX,
      y: 0,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
      flipY: maxY,
    };
  }
  public normalizeData(data: PlanInput = {}): Plan {
    const walls = Array.isArray(data.walls)
      ? data.walls.map((value) => this.normalizeWall(value))
      : [];
    if (data.upAxis3d !== 'z')
      for (const wall of walls)
        if (wall.placement3d) {
          const p = wall.placement3d;
          wall.placement3d = { ...p, y: p.z, z: p.y, yaw: -p.yaw };
        }
    return {
      upAxis3d: 'z',
      lights3d: this.normalizeLights(data, { walls }),
      name: String(data.name ?? 'Tiling plan').trim() || 'Tiling plan',
      units: String(data.units ?? 'mm').trim() || 'mm',
      canvas: this.canvasFromWalls(walls),
      patterns: Array.isArray(data.patterns)
        ? data.patterns.map((value) => this.normalizePattern(value))
        : [],
      walls,
    };
  }
  public wallIn(plan: Plan | null, name: string) {
    return plan?.walls?.find((wall) => wall.name === name) || null;
  }
}
