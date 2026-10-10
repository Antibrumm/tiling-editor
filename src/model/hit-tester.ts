import type { Plan, Position, SurfaceSelectionHit } from './types';
import { GeometryTools } from './geometry';
/**
 * Finds the wall or object under a point in the 2D viewport's world coordinates.
 * Reads an injected plan or plan provider, applies flipY and wall transforms, and checks
 * objects before wall outlines in reverse model order. Returns a semantic selection or null.
 */
export class HitTester {
  constructor(
    private planProvider: Plan | (() => Plan),
    private geometry = new GeometryTools(),
  ) {}
  hitTest(worldPoint: Position): SurfaceSelectionHit | null {
    const supplied =
      typeof this.planProvider === 'function' ? this.planProvider() : this.planProvider;
    const plan = supplied;
    const flipY = Number(plan.canvas.flipY || 0);
    const planPoint = { x: worldPoint.x, y: flipY - worldPoint.y };
    for (const wall of [...plan.walls].reverse()) {
      const local = this.geometry.worldToLocal(planPoint, wall);
      for (let objectIndex = wall.objects.length - 1; objectIndex >= 0; objectIndex--) {
        const object = wall.objects[objectIndex];
        const objectHit =
          local.x >= object.x &&
          local.x <= object.x + object.width &&
          local.y >= object.y &&
          local.y <= object.y + object.height;
        if (objectHit) {
          return { type: 'object', wallId: wall.name, objectName: object.name, objectIndex };
        }
      }
      const outline = wall.outline.points.map(([x, y]) => ({ x, y }));
      const wallHit = outline.length >= 3 && this.geometry.pointInPolygon(local, outline);
      if (wallHit) {
        return { type: 'wall', wallId: wall.name };
      }
    }
    return null;
  }
}
