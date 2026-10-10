import type { Plan, Placement, Wall } from './types';

/**
 * Resolves explicit or suggested 3D placements for plan surfaces.
 * Finds the floor and places named room walls around its bounds; unknown walls stay separate.
 * Positions remain in plan millimeters and yaw in degrees, with the floor on XY and Z up.
 */
export class ScenePlacement {
  public floor(plan: Pick<Plan, 'walls'>) {
    return (
      plan.walls.find((w) => w.placement3d?.type === 'floor') ||
      plan.walls.find((w) => /^(floor|ground|boden)$/i.test(w.name))
    );
  }
  public suggest(plan: Pick<Plan, 'walls'>, wall: Wall, index: number): Placement {
    const floor = this.floor(plan);
    const points = floor?.outline.points || [
      [0, 0],
      [3000, 3000],
    ];
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const name = wall.name.toLowerCase();
    if (wall === floor) return { type: 'floor', x: 0, y: 0, z: 0, yaw: 0 };
    if (name === 'back') return { type: 'wall', x: minX, y: maxY, z: 0, yaw: 0 };
    if (name === 'left') return { type: 'wall', x: minX, y: minY, z: 0, yaw: 90 };
    if (name === 'right') return { type: 'wall', x: maxX, y: maxY, z: 0, yaw: -90 };
    if (name === 'front') return { type: 'wall', x: maxX, y: minY, z: 0, yaw: 180 };
    // Unnamed surfaces remain separate until the user assigns their placement.
    return { type: 'wall', x: maxX + 1000 + index * 800, y: minY, z: 0, yaw: 0 };
  }
  public effective(plan: Pick<Plan, 'walls'>, wall: Wall, index: number): Placement {
    return wall.placement3d || this.suggest(plan, wall, index);
  }
}
