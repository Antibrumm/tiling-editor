import type { Plan } from './types';
import { TileCounter } from './tile-counter';

/** Supplies the same derived room totals and wall results to HTML and PDF reports. */
export class TileReportService {
  private counter = new TileCounter();
  public analyze(plan: Plan) {
    const walls = plan.walls.map((wall) => ({
      wall,
      result: this.counter.analyze(wall, plan.patterns),
      areaM2: this.counter.wallAreaM2(wall),
    }));
    const tileTypes = new Map<string, { areaM2: number; count: number; complete: boolean }>();
    for (const { wall, result } of walls) {
      wall.patternRegions.forEach((region, index) => {
        if (!region.pattern) return;
        const total = tileTypes.get(region.pattern) ?? { areaM2: 0, count: 0, complete: true };
        const detail = result?.regions[index];
        total.areaM2 += detail?.areaM2 ?? 0;
        total.count += detail?.count ?? 0;
        total.complete &&= detail !== undefined;
        tileTypes.set(region.pattern, total);
      });
    }
    return {
      walls,
      wallAreaM2: walls.reduce((sum, wall) => sum + wall.areaM2, 0),
      regionAreaM2: walls.every(({ result }) => result !== null)
        ? walls.reduce(
            (sum, { result }) =>
              sum +
              (result?.regions.reduce((subtotal, region) => subtotal + region.areaM2, 0) ?? 0),
            0,
          )
        : null,
      tileTypes,
    };
  }
}
