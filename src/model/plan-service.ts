import { PatternRegionGeometry } from './pattern-region-geometry';
import { PlanNormalizer } from './plan-normalizer';
import { ScenePlacement } from './scene-placement';
import type { PlanChange } from './events';
import type {
  Plan,
  PlanInput,
  Input,
  PatternInput,
  Point,
  PatternRegion,
  PlanObject,
  Wall,
  WallInput,
  Light,
} from './types';

function isKey<T extends string>(key: string, keys: readonly T[]): key is T {
  return keys.includes(key as T);
}

/**
 * Owns the persistent plan and applies model edits through semantic operations.
 * Uses an injected PlanNormalizer for input defaults and compatibility conversion.
 * Each emitted change refreshes canvas bounds, publishes state, and notifies listeners;
 * snapshot() returns a detached copy for rendering, serialization, and reset baselines.
 */
export class PlanService {
  private regionGeometry = new PatternRegionGeometry();
  private placement = new ScenePlacement();
  data: Plan;
  listeners = new Set<(change: PlanChange) => void>();
  constructor(
    data: PlanInput = {},
    private publish: () => void = () => {},
    private normalizer = new PlanNormalizer(),
  ) {
    this.data = this.normalizer.normalizeData(data);
  }
  setLightValue(id: string, key: string, value: unknown) {
    if (
      !isKey(key, [
        'x',
        'y',
        'z',
        'aimX',
        'aimY',
        'aimZ',
        'color',
        'intensity',
        'type',
        'angle',
      ] as const)
    )
      return false;
    const light = this.data.lights3d.find((light) => light.id === id);
    if (!light) return false;
    if (key === 'type') {
      if (value !== 'directional' && value !== 'conic') return false;
      light.type = value;
    } else if (key === 'color') {
      const next = String(value);
      if (!/^#[0-9a-f]{6}$/i.test(next)) return false;
      light.color = next;
    } else {
      const next = Number(value);
      if (
        !Number.isFinite(next) ||
        (key === 'intensity' && next < 0) ||
        (key === 'angle' && (next < 1 || next > 179))
      )
        return false;
      light[key] = next;
    }
    this.emit({ type: 'light-change', lightId: id, key, value: light[key] });
    return true;
  }
  addLight(type: Light['type'] = 'directional') {
    if (type !== 'directional' && type !== 'conic') throw new Error('Unknown light type.');
    let index = 1;
    while (this.data.lights3d.some((light) => light.id === 'light-' + index)) index++;
    const previous = this.data.lights3d.at(-1),
      aim = this.normalizer.floorAim(this.data);
    const light: Light = {
      id: 'light-' + index,
      type,
      angle: 60,
      x: previous ? previous.x + 1000 : 5000,
      y: previous?.y ?? -6000,
      z: previous?.z ?? 9000,
      ...aim,
      color: previous?.color ?? '#ffffff',
      intensity: previous?.intensity ?? 2.5,
    };
    this.data.lights3d.push(light);
    this.emit({ type: 'light-add', lightId: light.id });
    return light.id;
  }
  removeLight(id: string) {
    const index = this.data.lights3d.findIndex((light) => light.id === id);
    if (index < 0) return false;
    this.data.lights3d.splice(index, 1);
    this.emit({ type: 'light-remove', lightId: id });
    return true;
  }
  onEvent(listener: (change: PlanChange) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(change: PlanChange = { type: 'change' }) {
    this.data.canvas = this.normalizer.canvasFromWalls(this.data.walls);
    this.publish();
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error('PlanService change listener failed:', error);
      }
    }
  }
  get name() {
    return this.data?.name || 'Tiling plan';
  }
  setName(name: string) {
    const oldName = this.data.name;
    this.data.name = String(name ?? '').trim() || 'Tiling plan';
    this.emit({ type: 'name-change', oldName, name: this.data.name });
  }
  replaceData(data: PlanInput, change: PlanChange = { type: 'replace' }, emit = true) {
    this.data = this.normalizer.normalizeData(data);
    if (emit) this.emit(change);
  }
  snapshot() {
    return structuredClone(this.data);
  }
  wall(name: string) {
    return this.normalizer.wallIn(this.data, name);
  }
  moveWall(wallName: string, x: number, y: number) {
    const wall = this.wall(wallName);
    if (!wall) return false;
    wall.x = Math.round(Number(x) || 0);
    wall.y = Math.round(Number(y) || 0);
    this.emit({ type: 'wall-move', wallName, x: wall.x, y: wall.y });
    return true;
  }
  moveObject(wallName: string, objectIndex: number, x: number, y: number, objectName: string = '') {
    const wall = this.wall(wallName);
    if (!wall) return false;
    const object = Number.isInteger(objectIndex)
      ? wall.objects[objectIndex]
      : wall.objects.find((o) => o.name === objectName);
    if (!object) return false;
    object.x = Math.round(Number(x) || 0);
    object.y = Math.round(Number(y) || 0);
    this.emit({
      type: 'object-move',
      wallName,
      objectIndex,
      objectName: object.name,
      x: object.x,
      y: object.y,
    });
    return true;
  }
  setPlacement3d(wallName: string, key: string, value: unknown) {
    if (!isKey(key, ['type', 'x', 'y', 'z', 'yaw'] as const)) return false;
    const wall = this.wall(wallName);
    if (!wall) return false;
    const placement =
      wall.placement3d || this.placement.suggest(this.data, wall, this.data.walls.indexOf(wall));
    if (key === 'type') {
      if (value !== 'floor' && value !== 'wall') return false;
      wall.placement3d = { ...placement, type: value };
    } else {
      const next = Number(value);
      if (!Number.isFinite(next)) return false;
      wall.placement3d = { ...placement, [key]: next };
    }
    this.emit({ type: 'surface-placement', wallName, key, value });
    return true;
  }
  setWallValue(wallName: string, key: string, value: unknown) {
    if (!isKey(key, ['x', 'y', 'rotation'] as const)) return false;
    const w = this.wall(wallName);
    if (!w) return false;
    const oldValue = w[key];
    const next = Number(value);
    if (!Number.isFinite(next)) return false;
    w[key] = next;
    this.emit({ type: 'wall-change', wallName, key, oldValue, value: w[key] });
    return true;
  }
  setObjectValue(wallName: string, index: number, key: string, value: unknown) {
    if (!isKey(key, ['name', 'x', 'y', 'width', 'height', 'fill', 'depth'] as const)) return false;
    const o = this.wall(wallName)?.objects[index];
    if (!o) return false;
    const objectName = o.name;
    const oldValue = o[key];
    if (key === 'name' || key === 'fill') o[key] = String(value);
    else {
      const next = Number(value);
      if (!Number.isFinite(next)) return false;
      o[key] = key === 'depth' ? Math.max(1, next) : next;
    }
    this.emit({ type: 'object-change', wallName, index, objectName, key, oldValue, value: o[key] });
    return true;
  }
  setOutlineValue(wallName: string, key: string, value: unknown) {
    if (!isKey(key, ['patternInset', 'fill', 'stroke', 'strokeWidth'] as const)) return false;
    const o = this.wall(wallName)?.outline;
    if (!o) return false;
    const oldValue = o[key];
    if (key === 'strokeWidth' || key === 'patternInset') {
      const next = Number(value);
      if (!Number.isFinite(next)) return false;
      o[key] = key === 'patternInset' ? Math.max(0, next) : next;
    } else {
      if (
        value != null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      )
        return false;
      o[key] = String(value ?? '');
    }
    this.emit({ type: 'outline-change', wallName, key, oldValue, value: o[key] });
    return true;
  }
  setOutlinePoints(wallName: string, points: Point[]) {
    const o = this.wall(wallName)?.outline;
    if (!o || !Array.isArray(points)) return false;
    const normalized = points
      .map((value) => this.normalizer.normalizePoint(value))
      .filter((p) => p.every(Number.isFinite));
    if (normalized.length < 3) return false;
    const oldValue = o.points.map((p) => [...p]);
    o.points = normalized;
    this.emit({
      type: 'outline-change',
      wallName,
      key: 'points',
      oldValue,
      value: o.points.map((p) => [...p]),
    });
    return true;
  }
  setPatternValue(patternName: string, key: string, value: unknown) {
    if (
      !isKey(key, [
        'tileWidth',
        'tileHeight',
        'borderSize',
        'tileColor',
        'borderColor',
        'tileTexture',
        'randomTextureRotation',
      ] as const)
    )
      return false;
    const p = this.data.patterns.find((p) => p.name === patternName);
    if (!p) return false;
    const oldValue = p[key];
    if (key === 'tileColor' || key === 'borderColor' || key === 'tileTexture') {
      if (
        value != null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      )
        return false;
      p[key] = String(value ?? '');
    } else if (key === 'randomTextureRotation') p[key] = Boolean(value);
    else {
      const next = Number(value);
      if (!Number.isFinite(next)) return false;
      p[key] = next;
    }
    this.emit({ type: 'pattern-change', patternName, key, oldValue, value: p[key] });
    return true;
  }
  addPatternRegion(wallName: string, region: Input<PatternRegion> = {}) {
    const w = this.wall(wallName);
    if (!w) return false;
    const added = this.normalizer.normalizePatternRegion(region);
    if (added.fullWall && w.patternRegions.some((existing) => existing.fullWall)) return false;
    w.patternRegions.push(added);
    this.emit({
      type: 'pattern-region-add',
      wallName,
      index: w.patternRegions.length - 1,
      region: structuredClone(added),
    });
    return true;
  }
  setPatternRegion(wallName: string, index: number, key: string, value: unknown) {
    const w = this.wall(wallName),
      r = w?.patternRegions?.[index];
    if (
      !r ||
      !isKey(key, [
        'x',
        'y',
        'width',
        'height',
        'pattern',
        'patternX',
        'patternY',
        'patternRotation',
        'fullWall',
      ] as const)
    )
      return false;
    const oldValue = r[key];
    if (key === 'fullWall') {
      if (typeof value !== 'boolean') return false;
      if (value && w.patternRegions.some((existing) => existing !== r && existing.fullWall))
        return false;
      if (r.fullWall && !value) {
        const bounds = this.regionGeometry.resolve(w, r);
        Object.assign(r, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      }
      r.fullWall = value;
    } else if (key === 'pattern') {
      if (
        value != null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      )
        return false;
      r[key] = String(value ?? '');
    } else {
      const next = Number(value);
      if (!Number.isFinite(next)) return false;
      r[key] = key === 'width' || key === 'height' ? Math.max(0, next) : next;
    }
    this.emit({ type: 'pattern-region-change', wallName, index, key, oldValue, value: r[key] });
    return true;
  }
  removePatternRegion(wallName: string, index: number) {
    const w = this.wall(wallName);
    if (!w || !w.patternRegions?.[index]) return false;
    const [region] = w.patternRegions.splice(index, 1);
    this.emit({ type: 'pattern-region-remove', wallName, index, region });
    return true;
  }
  renameWall(oldName: string, newName: string) {
    const w = this.wall(oldName);
    const n = String(newName || '').trim();
    if (!w || !n || this.wall(n)) return false;
    w.name = n;
    this.emit({ type: 'wall-rename', wallName: n, oldName, newName: n });
    return true;
  }
  addWall(wall: WallInput) {
    const added = this.normalizer.normalizeWall(wall);
    this.data.walls.push(added);
    this.emit({ type: 'wall-add', wallName: added.name });
    return true;
  }
  removeWall(name: string) {
    const i = this.data.walls.findIndex((w) => w.name === name);
    if (i < 0) return false;
    const removed = this.data.walls[i];
    this.data.walls.splice(i, 1);
    this.emit({ type: 'wall-remove', wallName: removed.name });
    return true;
  }
  resetWall(name: string, baseline: Wall) {
    const i = this.data.walls.findIndex((w) => w.name === name);
    if (i < 0 || !baseline) return false;
    const restored = this.normalizer.normalizeWall(baseline);
    if (
      restored.name !== name &&
      this.data.walls.some((w, index) => index !== i && w.name === restored.name)
    )
      return false;
    const oldName = this.data.walls[i].name;
    this.data.walls[i] = restored;
    this.emit({ type: 'wall-reset', wallName: restored.name, oldName });
    return true;
  }
  addObject(wallName: string, object: Input<PlanObject>) {
    const w = this.wall(wallName);
    if (!w) return false;
    const added = this.normalizer.normalizeObject(object);
    w.objects.push(added);
    this.emit({
      type: 'object-add',
      wallName,
      index: w.objects.length - 1,
      objectName: added.name,
    });
    return true;
  }
  removeObject(wallName: string, index: number) {
    const w = this.wall(wallName);
    if (!w || !w.objects[index]) return false;
    const removed = w.objects[index];
    w.objects.splice(index, 1);
    this.emit({ type: 'object-remove', wallName, index, objectName: removed.name });
    return true;
  }
  resetObject(wallName: string, index: number, baseline: PlanObject) {
    const w = this.wall(wallName);
    if (!w || !w.objects[index] || !baseline) return false;
    const restored = this.normalizer.normalizeObject(baseline);
    w.objects[index] = restored;
    this.emit({ type: 'object-reset', wallName, index, objectName: restored.name });
    return true;
  }
  addPattern(pattern: PatternInput) {
    const p = this.normalizer.normalizePattern(pattern);
    if (!p.name || this.data.patterns.some((x) => x.name === p.name)) return false;
    this.data.patterns.push(p);
    this.emit({ type: 'pattern-add', patternName: p.name });
    return true;
  }
  duplicatePattern(name: string) {
    const source = this.data.patterns.find((p) => p.name === name);
    if (!source) return false;
    let i = 1,
      copyName = name + '-copy';
    while (this.data.patterns.some((p) => p.name === copyName)) copyName = name + '-copy-' + ++i;
    const copy = { ...structuredClone(source), name: copyName };
    this.data.patterns.splice(this.data.patterns.indexOf(source) + 1, 0, copy);
    this.emit({ type: 'pattern-duplicate', patternName: name, newName: copyName });
    return true;
  }
  removePattern(name: string) {
    if (this.data.walls.some((w) => w.patternRegions?.some((r) => r.pattern === name)))
      return false;
    const i = this.data.patterns.findIndex((p) => p.name === name);
    if (i < 0) return false;
    this.data.patterns.splice(i, 1);
    this.emit({ type: 'pattern-remove', patternName: name });
    return true;
  }
  renamePattern(oldName: string, newName: string) {
    const p = this.data.patterns.find((p) => p.name === oldName);
    const n = String(newName || '').trim();
    if (!p || !n || this.data.patterns.some((x) => x.name === n)) return false;
    p.name = n;
    for (const w of this.data.walls) {
      for (const r of w.patternRegions || []) if (r.pattern === oldName) r.pattern = n;
    }
    this.emit({ type: 'pattern-rename', oldName, newName: n });
    return true;
  }
  reorderPattern(fromIndex: number, toIndex: number) {
    const a = this.data.patterns;
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex >= a.length ||
      toIndex < 0 ||
      toIndex >= a.length ||
      fromIndex === toIndex
    )
      return false;
    const [item] = a.splice(fromIndex, 1);
    a.splice(toIndex, 0, item);
    this.emit({ type: 'pattern-reorder', patternName: item.name, fromIndex, toIndex });
    return true;
  }
  reorderWall(fromIndex: number, toIndex: number) {
    const a = this.data.walls;
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex >= a.length ||
      toIndex < 0 ||
      toIndex >= a.length ||
      fromIndex === toIndex
    )
      return false;
    const [item] = a.splice(fromIndex, 1);
    a.splice(toIndex, 0, item);
    this.emit({ type: 'wall-reorder', wallName: item.name, fromIndex, toIndex });
    return true;
  }
  reorderObject(wallName: string, fromIndex: number, toIndex: number) {
    const a = this.wall(wallName)?.objects;
    if (
      !a ||
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex >= a.length ||
      toIndex < 0 ||
      toIndex >= a.length ||
      fromIndex === toIndex
    )
      return false;
    const [item] = a.splice(fromIndex, 1);
    a.splice(toIndex, 0, item);
    this.emit({ type: 'object-reorder', wallName, objectName: item.name, fromIndex, toIndex });
    return true;
  }
}
