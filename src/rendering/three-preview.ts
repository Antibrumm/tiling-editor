import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Plan, Wall, Light, Bounds, SelectionHit } from '../model/types';
import { ScenePlacement } from '../model/scene-placement';
import { ObjectLayers } from '../model/object-layers';
import { getElement, get2DContext } from '../dom';
import type { PatternPainter, PatternSurface } from './pattern-painter';
interface PreviewState {
  plan(): Plan;
  showLights(): boolean;
  setShowLights(value: boolean): void;
  selectedWall(): string | null;
  selectedObject(): number | null;
  selectedLight(): string | null;
  select(hit: SelectionHit | null): void;
}
interface SurfaceBounds extends Bounds {
  width: number;
  height: number;
}
interface SurfaceEntry {
  group: THREE.Group;
  surface: THREE.Group;
  mesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;
  backMesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;
  signature?: string;
}
interface LightEntry {
  light: THREE.DirectionalLight | THREE.SpotLight;
  marker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  aimMarker: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  helper: THREE.DirectionalLightHelper | THREE.SpotLightHelper;
}

/**
 * Owns the lazily initialized Three.js scene, camera, controls, lights, and surface cache.
 * Reads plan and selection through injected callbacks and shares the 2D pattern painter
 * for texture baking. Converts plan millimeters to meters, reuses unchanged meshes,
 * and disposes replaced or removed resources. Camera fitting excludes light helpers;
 * a fit without a preset preserves the current viewing direction.
 */
export class ThreePreview {
  private placement = new ScenePlacement();
  private objectLayers = new ObjectLayers();
  container: HTMLElement;
  entries = new Map<string, SurfaceEntry>();
  lights = new Map<string, LightEntry>();
  pending = false;
  loading = false;
  textureRevision = 0;
  needsFit = true;
  pointerStart: { id: number; x: number; y: number; button: number; multiple: boolean } | null =
    null;
  THREE!: typeof import('three');
  renderer: THREE.WebGLRenderer | null = null;
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  controls!: OrbitControls;
  grid!: THREE.GridHelper;

  constructor(
    container: HTMLElement,
    private state: PreviewState,
    private paintSurfacePattern: PatternPainter,
    private createRenderer: (three: typeof import('three')) => THREE.WebGLRenderer = (three) =>
      new three.WebGLRenderer({ antialias: true, alpha: false }),
  ) {
    this.container = container;
    this.entries = new Map();
    this.lights = new Map();
    this.pending = false;
    this.loading = false;
    this.textureRevision = 0;
    this.needsFit = true;
    this.pointerStart = null;
    getElement('three-light-toggle').onchange = (event) => {
      this.state.setShowLights((event.currentTarget as HTMLInputElement).checked);
    };
    getElement('three-fit').onclick = () => {
      this.fit();
      this.render();
    };
    for (const name of ['perspective', 'top', 'front'] as const)
      getElement('three-' + name).onclick = () => {
        this.fit(name);
        this.render();
      };
    new ResizeObserver(() => this.request()).observe(container);
  }
  async activate() {
    if (this.renderer) {
      this.request();
      return;
    }
    if (this.loading) return;
    this.loading = true;
    const status = getElement('three-status');
    status.textContent = 'Preparing 3D preview…';
    try {
      const [THREE, { OrbitControls }] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      this.THREE = THREE;
      this.renderer = this.createRenderer(THREE);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.container.insertBefore(this.renderer.domElement, this.container.firstChild);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#eaf0ed');
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
      this.camera.up.set(0, 0, 1);
      this.camera.position.set(6, -6, 5);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = false;
      this.controls.maxPolarAngle = Math.PI * 0.98;
      this.controls.addEventListener('change', () => this.render());
      const sky = new THREE.HemisphereLight(0xffffff, 0x778579, 2.1);
      sky.position.set(0, 0, 1);
      this.scene.add(sky);
      this.grid = new THREE.GridHelper(20, 40, 0x9ab3a6, 0xc8d7cf);
      this.grid.rotation.x = Math.PI / 2;
      this.grid.position.z = -0.025;
      this.scene.add(this.grid);
      const element = this.renderer.domElement;
      element.addEventListener('pointerdown', (e) => {
        this.pointerStart = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          button: e.button,
          multiple: !e.isPrimary,
        };
      });
      element.addEventListener('pointerup', (e) => {
        const start = this.pointerStart;
        this.pointerStart = null;
        if (
          start &&
          start.id === e.pointerId &&
          !start.multiple &&
          start.button === 0 &&
          Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5
        )
          this.pick(e);
      });
      element.addEventListener('pointercancel', () => {
        this.pointerStart = null;
      });
      element.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        status.textContent = '3D graphics context was lost. Reload the editor to restore it.';
      });
      status.textContent =
        'Drag to orbit · Shift-drag / right-drag to pan · scroll or pinch to zoom · click to select';
      this.loading = false;
      this.request();
    } catch (error) {
      this.renderer?.dispose();
      this.renderer = null;
      this.loading = false;
      status.textContent =
        '3D preview needs WebGL 2 in your browser. The 2D editor is available. ' +
        (error instanceof Error ? error.message : String(error));
    }
  }
  request() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      if (!this.renderer || this.container.hidden) return;
      this.update(this.state.plan());
    });
  }
  dispose(entry: SurfaceEntry) {
    this.scene.remove(entry.group);
    entry.group.traverse((node) => {
      if (!(node instanceof this.THREE.Mesh || node instanceof this.THREE.LineSegments)) return;
      const renderable = node as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material | THREE.Material[]
      >;
      renderable.geometry.dispose();
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const material of materials) {
        if (material) {
          const texture: unknown = 'map' in material ? material.map : null;
          if (texture instanceof this.THREE.Texture) texture.dispose();
          material.dispose();
        }
      }
    });
  }
  bake(wall: Wall, plan: Plan, bounds: SurfaceBounds) {
    const THREE = this.THREE;
    const canvas = document.createElement('canvas');
    const size = Math.max(bounds.width, bounds.height, 1),
      resolution = Math.min(2048, this.renderer!.capabilities.maxTextureSize) / size;
    canvas.width = Math.max(1, Math.ceil(bounds.width * resolution));
    canvas.height = Math.max(1, Math.ceil(bounds.height * resolution));
    const ctx = get2DContext(canvas);
    ctx.setTransform(
      resolution,
      0,
      0,
      -resolution,
      -bounds.minX * resolution,
      bounds.maxY * resolution,
    );
    const points = wall.outline.points,
      path = new Path2D();
    path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    path.closePath();
    const patterns = new Map(plan.patterns.map((p) => [p.name, p]));
    this.paintSurfacePattern(ctx, path, wall.outline, patterns, null, resolution, 1);
    for (const region of wall.patternRegions || []) {
      if (!region.pattern || !(region.width > 0 && region.height > 0)) continue;
      const regionPath = new Path2D();
      regionPath.rect(region.x, region.y, region.width, region.height);
      const outline: PatternSurface = {
        ...region,
        patternInset: wall.outline.patternInset,
        perimeterPoints: wall.outline.points,
        points: [
          [region.x, region.y],
          [region.x + region.width, region.y],
          [region.x + region.width, region.y + region.height],
          [region.x, region.y + region.height],
        ],
      };
      ctx.save();
      ctx.clip(path);
      this.paintSurfacePattern(ctx, regionPath, outline, patterns, null, resolution, 1);
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer!.capabilities.getMaxAnisotropy());
    return texture;
  }
  build(wall: Wall, plan: Plan): SurfaceEntry {
    const THREE = this.THREE,
      points = wall.outline.points;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const bounds: SurfaceBounds = {
      width: 0,
      height: 0,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
    bounds.width = Math.max(1, bounds.maxX - bounds.minX);
    bounds.height = Math.max(1, bounds.maxY - bounds.minY);
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0] / 1000, points[0][1] / 1000);
    for (const p of points.slice(1)) shape.lineTo(p[0] / 1000, p[1] / 1000);
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape),
      vertices = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv');
    for (let i = 0; i < vertices.count; i++)
      uv.setXY(
        i,
        (vertices.getX(i) * 1000 - bounds.minX) / bounds.width,
        (vertices.getY(i) * 1000 - bounds.minY) / bounds.height,
      );
    uv.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      map: this.bake(wall, plan, bounds),
      side: THREE.FrontSide,
      roughness: 0.83,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { type: 'wall', wallId: wall.name };
    const backMesh = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.BackSide, roughness: 0.83 }),
    );
    backMesh.userData = { type: 'wall', wallId: wall.name };
    const frame = new THREE.Group(),
      surface = new THREE.Group();
    frame.add(surface);
    surface.add(mesh, backMesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x6c8175 }),
    );
    edges.position.z = 0.002;
    surface.add(edges);
    const offsets = this.objectLayers.offsets(wall.objects);
    wall.objects.forEach((o, index) => {
      if (!(o.width > 0 && o.height > 0)) return;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(o.width / 1000, o.height / 1000, (o.depth || 10) / 1000),
        new THREE.MeshStandardMaterial({ color: o.fill || '#9aada3', roughness: 0.72 }),
      );
      box.position.set(
        (o.x + o.width / 2) / 1000,
        (o.y + o.height / 2) / 1000,
        (o.depth || 10) / 2000 + (offsets.get(index) ?? 0.003),
      );
      box.userData = { type: 'object', wallId: wall.name, objectName: o.name, objectIndex: index };
      surface.add(box);
    });
    this.scene.add(frame);
    return { group: frame, surface, mesh, backMesh };
  }
  updateLights(configs: Light[]) {
    const THREE = this.THREE,
      keep = new Set();
    for (const config of configs) {
      keep.add(config.id);
      let entry = this.lights.get(config.id);
      if (entry && entry.light instanceof THREE.SpotLight !== (config.type === 'conic')) {
        this.disposeLight(entry);
        this.lights.delete(config.id);
        entry = undefined;
      }
      if (!entry) {
        // Match directional intensity without distance falloff; only the cone limits coverage.
        const light =
          config.type === 'conic'
            ? new THREE.SpotLight(0xffffff, 2.5, 0, Math.PI / 6, 0, 0)
            : new THREE.DirectionalLight(0xffffff, 2.5);
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xffba45 }),
        );
        const aimMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.04, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0x16b8ba }),
        );
        const helper =
          light instanceof THREE.SpotLight
            ? new THREE.SpotLightHelper(light, 0xffba45)
            : new THREE.DirectionalLightHelper(light, 0.3, 0xffba45);
        marker.userData = aimMarker.userData = { type: 'light', lightId: config.id };
        entry = { light, marker, aimMarker, helper };
        this.lights.set(config.id, entry);
        this.scene.add(light, light.target, marker, aimMarker, helper);
      }
      entry.light.position.set(config.x / 1000, config.y / 1000, config.z / 1000);
      entry.light.color.set(config.color);
      entry.light.intensity = config.intensity;
      if (entry.light instanceof THREE.SpotLight)
        entry.light.angle = (config.angle * Math.PI) / 360;
      entry.light.target.position.set(config.aimX / 1000, config.aimY / 1000, config.aimZ / 1000);
      entry.light.updateMatrixWorld();
      entry.light.target.updateMatrixWorld();
      entry.helper.update();
      if (entry.helper instanceof THREE.SpotLightHelper && entry.light instanceof THREE.SpotLight) {
        const length = Math.max(0.1, entry.light.position.distanceTo(entry.light.target.position));
        const width = length * Math.tan(entry.light.angle);
        entry.helper.cone.scale.set(width, width, length);
      }
      entry.marker.position.copy(entry.light.position);
      entry.aimMarker.position.copy(entry.light.target.position);
      const selected = this.state.selectedLight() === config.id;
      entry.marker.material.color.set(selected ? 0x37ae69 : 0xffba45);
      entry.aimMarker.material.color.set(selected ? 0x37ae69 : 0x16b8ba);
      entry.marker.scale.setScalar(selected ? 1.4 : 1);
      entry.aimMarker.scale.setScalar(selected ? 1.4 : 1);
      entry.marker.visible =
        entry.aimMarker.visible =
        entry.helper.visible =
          this.state.showLights();
    }
    for (const [id, entry] of this.lights)
      if (!keep.has(id)) {
        this.disposeLight(entry);
        this.lights.delete(id);
      }
  }
  private disposeLight(entry: LightEntry) {
    this.scene.remove(entry.light, entry.light.target, entry.marker, entry.aimMarker, entry.helper);
    entry.helper.dispose();
    entry.light.dispose();
    for (const marker of [entry.marker, entry.aimMarker]) {
      marker.geometry.dispose();
      marker.material.dispose();
    }
  }
  update(plan: Plan) {
    this.updateLights(plan.lights3d);
    const keep = new Set();
    plan.walls.forEach((wall, index) => {
      if (wall.outline.points.length < 3) return;
      keep.add(wall.name);
      const used = new Set([wall.outline.pattern, ...wall.patternRegions.map((r) => r.pattern)]);
      const signature = JSON.stringify([
        wall.outline,
        wall.patternRegions,
        wall.objects,
        plan.patterns.filter((p) => used.has(p.name)),
        this.textureRevision,
      ]);
      let entry = this.entries.get(wall.name);
      if (!entry || entry.signature !== signature) {
        if (entry) this.dispose(entry);
        entry = this.build(wall, plan);
        entry.signature = signature;
        this.entries.set(wall.name, entry);
      }
      const p = this.placement.effective(plan, wall, index);
      entry.group.position.set(p.x / 1000, p.y / 1000, p.z / 1000);
      entry.group.rotation.z = (p.yaw * Math.PI) / 180;
      // Floors lie directly on XY. Wall-local height becomes world Z.
      entry.surface.rotation.x = p.type === 'floor' ? 0 : Math.PI / 2;
      // For the T unwrap, walls follow the room boundary with their front
      // normal pointing inward. Floors retain +Z extrusion above XY.
      entry.surface.scale.z = 1;
      entry.surface.traverse((node) => {
        if (node instanceof this.THREE.Mesh) {
          const selected =
            node.userData.wallId === this.state.selectedWall() &&
            (node.userData.type === 'object'
              ? node.userData.objectIndex === this.state.selectedObject()
              : this.state.selectedObject() === null);
          const material: unknown = node.material;
          if (material instanceof this.THREE.MeshStandardMaterial) {
            material.emissive.set(selected ? 0x17472d : 0x000000);
            material.emissiveIntensity = selected ? 0.4 : 0;
          }
        }
      });
    });
    for (const [name, entry] of this.entries)
      if (!keep.has(name)) {
        this.dispose(entry);
        this.entries.delete(name);
      }
    if (this.needsFit && this.entries.size) {
      this.fit();
      this.needsFit = false;
    }
    const status = getElement('three-status');
    status.textContent = this.entries.size
      ? 'Drag to orbit · Shift / right-drag to pan · scroll or pinch to zoom · click to select' +
        (plan.walls.some((w) => !w.placement3d)
          ? ' · Suggested positions: edit “3D placement” to assemble your room.'
          : '')
      : 'Load a template or add a surface to see it in 3D.';
    this.render();
  }
  fit(preset: 'perspective' | 'top' | 'front' | null = null) {
    if (!this.renderer || !this.entries.size) return;
    const THREE = this.THREE,
      bounds = new THREE.Box3();
    for (const entry of this.entries.values()) bounds.expandByObject(entry.group);
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(0.5, size.length() / 2),
      aspect = Math.max(0.1, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    const halfVertical = (this.camera.fov * Math.PI) / 360,
      halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect),
      distance = (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.15;
    const direction =
      preset === 'top'
        ? new THREE.Vector3(0, -0.001, 1)
        : preset === 'front'
          ? new THREE.Vector3(0, -1, 0.12)
          : preset === 'perspective'
            ? new THREE.Vector3(1, -1, 0.8)
            : this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-12)
      direction.copy(this.camera.getWorldDirection(new THREE.Vector3())).negate();
    direction.normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.camera.near = Math.max(0.01, distance / 1000);
    this.camera.far = Math.max(100, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  render() {
    if (!this.renderer || this.container.hidden) return;
    const width = this.container.clientWidth,
      height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
  pick(event: PointerEvent) {
    const THREE = this.THREE,
      rect = this.renderer!.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const meshes: THREE.Object3D[] = [];
    for (const entry of this.entries.values())
      entry.group.traverse((node) => {
        if (node instanceof this.THREE.Mesh) meshes.push(node);
      });
    const markers: THREE.Object3D[] = [];
    for (const entry of this.lights.values())
      for (const marker of [entry.marker, entry.aimMarker])
        if (marker.visible) markers.push(marker);
    const hit = ray.intersectObjects(markers, false)[0] || ray.intersectObjects(meshes, false)[0];
    this.state.select((hit?.object.userData as SelectionHit | undefined) || null);
  }
}
