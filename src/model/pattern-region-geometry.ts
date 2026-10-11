import type { PatternRegion, Wall } from './types';

/** Resolves regions that follow the wall without persisting derived bounds. */
export class PatternRegionGeometry {
  public resolve(wall: Wall, region: PatternRegion): PatternRegion {
    if (!region.fullWall) return region;
    const xs = wall.outline.points.map(([x]) => x);
    const ys = wall.outline.points.map(([, y]) => y);
    if (!xs.length) return { ...region, x: 0, y: 0, width: 0, height: 0 };
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { ...region, x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
}
