const fs = require('fs'),
  assert = require('assert');
const THREE = require('three');
const elements = new Map(),
  document = {
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
  };
const context = {
  console,
  structuredClone,
  document,
  ResizeObserver: class {
    observe() {}
  },
  requestAnimationFrame() {},
  number: (n) => String(n),
  publishPersistentPlan() {},
  lightVisibleSignal: { value: false },
  selectedWallIdSignal: { value: null },
  selectedObjectIndexSignal: { value: null },
};
const loadModule = require('./load-module.cjs');
Object.assign(
  context,
  loadModule('src/model/plan-service.ts'),
  loadModule('src/model/scene-placement.ts'),
  loadModule('src/model/object-layers.ts'),
  loadModule('src/codecs/yaml.ts'),
);
context.yamlCodec = new context.YamlCodec();
context.scenePlacement = new context.ScenePlacement();
context.objectLayers = new context.ObjectLayers();
// Extracted services must publish independently, without editor globals.
let publications = 0;
const independent = new context.PlanService({}, () => publications++);
const untouched = new context.PlanService();
const changes = [];
const unsubscribe = independent.onEvent((change) => changes.push(change));
independent.setName('Independent plan');
assert.equal(publications, 1);
assert.deepStrictEqual(changes, [
  { type: 'name-change', oldName: 'Tiling plan', name: 'Independent plan' },
]);
assert.equal(untouched.name, 'Tiling plan');
const isolatedSnapshot = independent.snapshot();
isolatedSnapshot.name = 'Modified snapshot';
assert.equal(independent.name, 'Independent plan');
unsubscribe();
independent.setName('Renamed');
assert.equal(publications, 2);
assert.equal(changes.length, 1);
const service = new context.PlanService({
  patterns: [{ name: 'grid', tileWidth: 300, tileHeight: 300 }],
  walls: [
    {
      name: 'floor',
      outline: {
        points: [
          [0, 0],
          [3000, 0],
          [3000, 2000],
          [0, 2000],
        ],
        pattern: 'grid',
      },
      objects: [{ name: 'box', x: 10, y: 20, width: 100, height: 200, depth: 400, fill: 'red' }],
    },
    {
      name: 'back',
      outline: {
        points: [
          [0, 0],
          [3000, 0],
          [3000, 2400],
          [0, 2400],
        ],
        pattern: 'grid',
      },
    },
  ],
});
context.planService = service;
assert.equal(service.data.walls[0].placement3d, null);
assert.equal(
  context.scenePlacement.effective(service.data, service.data.walls[0], 0).type,
  'floor',
);
service.setPlacement3d('floor', 'x', 123);
service.setPlacement3d('back', 'yaw', 90);
assert.equal(service.setPlacement3d('floor', 'x', Infinity), false);
assert.equal(service.setPlacement3d('floor', 'type', 'ceiling'), false);
service.setObjectValue('floor', 0, 'depth', 450);
assert.equal(service.data.lights3d[0].aimX, 1500);
assert.equal(service.data.lights3d[0].aimY, 1000);
const aimed = new context.PlanService({
  upAxis3d: 'z',
  walls: [
    {
      name: 'floor',
      placement3d: { type: 'floor', x: 300, y: 400, z: 500, yaw: 90 },
      outline: {
        points: [
          [0, 0],
          [1000, 0],
          [1000, 2000],
          [0, 2000],
        ],
      },
    },
  ],
});
const center = aimed.data.lights3d[0];
assert(Math.abs(center.aimX + 700) < 1e-9);
assert(Math.abs(center.aimY - 900) < 1e-9);
assert.equal(center.aimZ, 500);
aimed.setLightValue(center.id, 'aimX', 9999);
const added = aimed.addLight(),
  newLight = aimed.data.lights3d.find((light) => light.id === added);
assert(
  Math.abs(newLight.aimX + 700) < 1e-9,
  'New lights aim at the floor instead of inheriting a changed aim',
);
assert.equal(newLight.aimZ, 500);
assert.equal(
  new context.PlanService(aimed.snapshot()).data.lights3d[0].aimX,
  9999,
  'Explicit saved aims are retained',
);
const firstLight = service.data.lights3d[0].id;
assert.equal(service.setLightValue(firstLight, 'z', 2800), true);
assert.equal(service.setLightValue(firstLight, 'x', Infinity), false);
assert.equal(service.setLightValue(firstLight, 'unknown', 100), false);
assert.equal(service.setLightValue('missing', 'x', 100), false);
assert.equal(service.data.lights3d[0].color, '#ffffff');
assert.equal(service.data.lights3d[0].intensity, 2.5);
assert.equal(service.setLightValue(firstLight, 'intensity', -1), false);
assert.equal(service.setLightValue(firstLight, 'intensity', Infinity), false);
assert.equal(service.setLightValue(firstLight, 'color', 'invalid'), false);
const secondLight = service.addLight();
assert.equal(service.setLightValue(secondLight, 'color', '#ff8040'), true);
assert.equal(service.setLightValue(secondLight, 'intensity', 0.75), true);
service.setLightValue(secondLight, 'aimX', 1250);
service.setLightValue(secondLight, 'aimY', -250);
service.setLightValue(secondLight, 'aimZ', 900);
assert.notEqual(firstLight, secondLight);
assert.equal(service.data.lights3d[0].aimZ, 0);
const migrated = context.yamlCodec.decode(
  'light3d:\n  x: 1200\n  y: -300\n  z: 4500\nwalls:\n  - name: floor\n    outline:\n      points: "0,0 100,0 100,100"',
);
assert.equal(migrated.lights3d.length, 1);
assert.equal(migrated.lights3d[0].x, 1200);
assert.equal(migrated.lights3d[0].aimZ, 0);
assert.equal(migrated.lights3d[0].type, 'directional', 'Legacy lights retain directional behavior');
assert.equal(migrated.lights3d[0].angle, 60);
assert.throws(
  () => new context.PlanService({ lights3d: [{ type: 'unknown' }] }),
  /Unknown light type/,
);
for (const angle of [0, 180, Infinity, 'invalid'])
  assert.throws(
    () => new context.PlanService({ lights3d: [{ type: 'conic', angle }] }),
    /cone angle/,
  );
const duplicated = new context.PlanService({
  lights3d: [{ id: 'same' }, { id: 'same' }, { id: 'same-2' }],
});
assert.equal(new Set(duplicated.data.lights3d.map((light) => light.id)).size, 3);
const decoded = context.yamlCodec.decode(context.yamlCodec.encode(service.snapshot()));
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(decoded)),
  JSON.parse(JSON.stringify(service.snapshot())),
);
assert.equal(decoded.lights3d[0].z, 2800);
global.document = document;
global.ResizeObserver = context.ResizeObserver;
global.requestAnimationFrame = context.requestAnimationFrame;
Object.assign(context, loadModule('src/rendering/three-preview.ts'));
const preview = new context.ThreePreview(
  { hidden: false, clientWidth: 1000, clientHeight: 600 },
  {
    plan: () => service.snapshot(),
    showLights: () => context.lightVisibleSignal.value,
    setShowLights: (value) => {
      context.lightVisibleSignal.value = value;
    },
    selectedWall: () => null,
    selectedObject: () => null,
    selectedLight: () => null,
    select() {},
  },
  () => {},
);
preview.THREE = THREE;
preview.scene = new THREE.Scene();
preview.renderer = {};
preview.bake = () => new THREE.Texture();
preview.fit = () => {};
preview.render = () => {};
preview.update(service.snapshot());
preview.scene.updateMatrixWorld(true);
assert.equal(preview.lights.size, 2);
const secondEntry = preview.lights.get(secondLight);
assert.equal(secondEntry.light.color.getHexString(), 'ff8040');
assert.equal(secondEntry.light.intensity, 0.75);
service.setLightValue(secondLight, 'intensity', 0);
preview.update(service.snapshot());
assert.equal(secondEntry.light.intensity, 0);
assert.equal(secondEntry.light.target.position.x, 1.25);
assert.equal(secondEntry.light.target.position.y, -0.25);
assert.equal(secondEntry.light.target.position.z, 0.9);
let helperDisposed = false,
  markerDisposed = false;
secondEntry.helper.addEventListener?.('dispose', () => (helperDisposed = true));
secondEntry.marker.geometry.addEventListener('dispose', () => (markerDisposed = true));
service.removeLight(secondLight);
preview.update(service.snapshot());
assert.equal(preview.lights.size, 1);
assert(!preview.scene.children.includes(secondEntry.light.target));
assert(markerDisposed);
service.removeLight(firstLight);
preview.update(service.snapshot());
assert.equal(preview.lights.size, 0);
assert.equal(
  context.yamlCodec.decode(context.yamlCodec.encode(service.snapshot())).lights3d.length,
  0,
);
const floor = preview.entries.get('floor');
const coneId = service.addLight('conic');
assert.equal(service.setLightValue(coneId, 'angle', 80), true);
for (const angle of [0, 180, Infinity, 'invalid'])
  assert.equal(service.setLightValue(coneId, 'angle', angle), false);
assert.equal(service.setLightValue(coneId, 'type', 'point'), false);
service.setLightValue(coneId, 'intensity', 3);
preview.update(service.snapshot());
const coneEntry = preview.lights.get(coneId);
assert(coneEntry.light instanceof THREE.SpotLight);
assert(coneEntry.helper instanceof THREE.SpotLightHelper);
assert.equal(coneEntry.light.angle, (80 * Math.PI) / 360);
assert.equal(coneEntry.light.intensity, 3);
assert.equal(coneEntry.light.decay, 0);
assert.equal(
  coneEntry.helper.cone.scale.z,
  coneEntry.light.position.distanceTo(coneEntry.light.target.position),
);
assert.equal(coneEntry.marker.visible, false);
service.setLightValue(coneId, 'angle', 30);
preview.update(service.snapshot());
assert.equal(preview.lights.get(coneId), coneEntry, 'Angle edits reuse the spotlight and helper');
assert.equal(coneEntry.light.angle, (30 * Math.PI) / 360);
const roundTripLights = context.yamlCodec.decode(
  context.yamlCodec.encode(service.snapshot()),
).lights3d;
assert.deepStrictEqual(roundTripLights, service.snapshot().lights3d);
let coneDisposed = false;
coneEntry.marker.geometry.addEventListener('dispose', () => (coneDisposed = true));
service.setLightValue(coneId, 'type', 'directional');
preview.update(service.snapshot());
assert(coneDisposed, 'Changing light type disposes the previous marker resources');
assert(preview.lights.get(coneId).light instanceof THREE.DirectionalLight);
assert(!preview.scene.children.includes(coneEntry.light));
assert(!preview.scene.children.includes(coneEntry.helper));
service.removeLight(coneId);
preview.update(service.snapshot());
assert.equal(preview.lights.size, 0);
const point = new THREE.Vector3(1, 2, 0).applyMatrix4(floor.mesh.matrixWorld);
assert(
  Math.abs(point.x - 1.123) < 1e-9 && Math.abs(point.y - 2) < 1e-9 && Math.abs(point.z) < 1e-9,
  'Floor local XY maps to world XY',
);
const box = floor.surface.children.find((n) => n.userData.type === 'object');
const boxCenter = new THREE.Vector3().setFromMatrixPosition(box.matrixWorld);
assert(boxCenter.z > 0, 'Floor boxes rise along Z');
const back = preview.entries.get('back');
const wallTop = new THREE.Vector3(0, 2, 0).applyMatrix4(back.mesh.matrixWorld);
assert(Math.abs(wallTop.z - 2) < 1e-9, 'Wall height maps to world Z');
const legacy = new context.PlanService({
  walls: [{ name: 'legacy', placement3d: { type: 'wall', x: 10, y: 400, z: 2000, yaw: 90 } }],
});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(legacy.data.walls[0].placement3d)),
  { type: 'wall', x: 10, y: 2000, z: 400, yaw: -90 },
  'Legacy Y-up placements migrate to Z-up',
);
assert.equal(legacy.data.upAxis3d, 'z');
const previous = floor.group;
preview.update(service.snapshot());
assert.strictEqual(preview.entries.get('floor').group, previous, 'Unchanged meshes are reused');
service.setObjectValue('floor', 0, 'width', 180);
preview.update(service.snapshot());
assert.notStrictEqual(preview.entries.get('floor').group, previous, 'Changed objects rebuild');
service.removeWall('back');
preview.update(service.snapshot());
assert.equal(preview.entries.size, 1, 'Removed surfaces are disposed');
const templateSource = fs.readFileSync('src/assets/base-model.yaml', 'utf8');
const template = context.yamlCodec.decode(templateSource);
preview.update(template);
preview.scene.updateMatrixWorld(true);
const inward = {
  back: [0, -1, 0],
  left: [1, 0, 0],
  right: [-1, 0, 0],
  front: [0, 1, 0],
  'armor-left': [0, -1, 0],
  'armor-back': [-1, 0, 0],
};
for (const [name, direction] of Object.entries(inward)) {
  const entry = preview.entries.get(name),
    actual = new THREE.Vector3(0, 0, 1).transformDirection(entry.surface.matrixWorld);
  assert(actual.distanceTo(new THREE.Vector3(...direction)) < 1e-9, name + ' extrudes inward');
}
for (const entry of preview.entries.values()) {
  assert.equal(entry.mesh.material.side, THREE.FrontSide);
  assert(entry.mesh.material.map?.isTexture);
  assert.equal(entry.backMesh.material.side, THREE.BackSide);
  assert.equal(entry.backMesh.material.map, null);
  assert.equal(entry.backMesh.material.color.getHexString(), 'ffffff');
  const target = new THREE.Vector3(0.5, 0.5, 0).applyMatrix4(entry.mesh.matrixWorld),
    normal = new THREE.Vector3(0, 0, 1).transformDirection(entry.mesh.matrixWorld);
  const frontRay = new THREE.Raycaster(target.clone().add(normal), normal.clone().negate());
  const backRay = new THREE.Raycaster(target.clone().sub(normal), normal.clone());
  assert.strictEqual(
    frontRay.intersectObjects([entry.mesh, entry.backMesh])[0]?.object,
    entry.mesh,
    'Interior uses the textured face',
  );
  assert.strictEqual(
    backRay.intersectObjects([entry.mesh, entry.backMesh])[0]?.object,
    entry.backMesh,
    'Exterior uses the white face',
  );
}
console.log(
  'Passed: textured interior and plain white exterior materials, with correct face visibility from both sides.',
);
const floorPoints = template.walls.find((w) => w.name === 'floor').outline.points;
for (const name of Object.keys(inward)) {
  const wall = template.walls.find((w) => w.name === name),
    entry = preview.entries.get(name),
    width = Math.max(...wall.outline.points.map((p) => p[0]));
  for (const x of [0, width]) {
    const endpoint = new THREE.Vector3(x / 1000, 0, 0).applyMatrix4(entry.mesh.matrixWorld);
    assert(
      floorPoints.some(
        ([fx, fy]) => Math.hypot(endpoint.x - fx / 1000, endpoint.y - fy / 1000) < 1e-9,
      ),
      name + ' endpoints meet the floor footprint',
    );
  }
}
console.log(
  'Passed: T-unwrapped template walls meet the stepped floor boundary; every wall normal points into the room.',
);
assert(
  template.walls.every((w) => w.objects.every((o) => o.depth === 10)),
  'Template objects initially have 10 mm depth',
);
const layers = new context.PlanService({
  walls: [
    {
      name: 'nested',
      outline: {
        points: [
          [0, 0],
          [1000, 0],
          [1000, 1000],
          [0, 1000],
        ],
      },
      objects: [
        { name: 'small', x: 40, y: 40, width: 30, height: 30 },
        { name: 'container', x: 0, y: 0, width: 500, height: 500 },
        { name: 'middle', x: 20, y: 20, width: 100, height: 100 },
        { name: 'separate', x: 700, y: 700, width: 100, height: 100 },
        { name: 'partial', x: 490, y: 490, width: 100, height: 100 },
      ],
    },
  ],
});
preview.update(layers.snapshot());
const nested = preview.entries
  .get('nested')
  .surface.children.filter((n) => n.userData.type === 'object');
const named = (name) => nested.find((n) => n.userData.objectName === name);
const backFace = (box) => box.position.z - box.geometry.parameters.depth / 2;
const frontFace = (box) => box.position.z + box.geometry.parameters.depth / 2;
assert(backFace(named('middle')) > frontFace(named('container')));
assert(backFace(named('small')) > frontFace(named('middle')));
assert(backFace(named('partial')) > frontFace(named('container')));
assert(Math.abs(backFace(named('separate')) - 0.003) < 1e-9);
assert(nested.every((box) => box.geometry.parameters.depth === 0.01));
console.log(
  'Passed: 10 mm initial depth, nesting independent of model order, partial overlap layering, and separate elements staying at the surface.',
);
console.log(
  'Passed: old-plan defaults, domain validation, placement/depth YAML round trip, floor orientation, object elevation, mesh reuse and removal.',
);
