const fs = require('fs'),
  assert = require('assert'),
  esbuild = require('esbuild');
const { JSDOM, VirtualConsole } = require('jsdom');
const ts = require('typescript');
const source = fs.readFileSync('src/editor.ts', 'utf8').replace("import './styles.css';", '');
// Instrument syntax nodes so formatting changes cannot silently disable tests.
const syntax = ts.createSourceFile(
  'editor.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const edits = [];
function instrument(node) {
  if (ts.isNewExpression(node) && node.expression.getText(syntax) === 'ThreePreview') {
    const lastArgument = node.arguments[node.arguments.length - 1];
    edits.push({ position: lastArgument.end, text: ', () => new window.TestRenderer()' });
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'init') {
    const publication = node.body.statements.find(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        statement.expression.expression.getText(syntax) === 'publishPersistentPlan',
    );
    assert(publication, 'Editor exposes the initial model publication');
    edits.push({
      position: publication.getStart(syntax),
      text: 'window.editorTest={threePreview,planService,selection,effectivePlan,yamlEditingSignal,YamlCodec,SvgCodec};\n',
    });
  }
  ts.forEachChild(node, instrument);
}
instrument(syntax);
assert.equal(edits.length, 2, 'Renderer injection and editor test access are installed');
let instrumented = source;
for (const edit of edits.sort((a, b) => b.position - a.position)) {
  instrumented =
    instrumented.slice(0, edit.position) + edit.text + instrumented.slice(edit.position);
}
const bundle = esbuild.buildSync({
  stdin: {
    contents: instrumented,
    resolveDir: process.cwd() + '/src',
    sourcefile: 'test-editor.mjs',
    loader: 'ts',
  },
  bundle: true,
  loader: { '.yaml': 'text', '.md': 'text' },
  format: 'iife',
  write: false,
  target: 'es2020',
}).outputFiles[0].text;
const html = fs
  .readFileSync('index.html', 'utf8')
  .replace(
    /<script\b[^>]*src="\.\/src\/editor.ts"[^>]*>\s*<\/script>/,
    () => '<script>' + bundle.replace(/<\/script/gi, '<\\/script') + '</script>',
  );
const errors = [],
  vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://editor.test/',
  virtualConsole: vc,
  beforeParse(window) {
    window.ResizeObserver = class {
      observe() {}
    };
    window.Path2D = class {
      moveTo() {}
      lineTo() {}
      closePath() {}
      rect() {}
    };
    window.structuredClone = structuredClone;
    window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    window.HTMLCanvasElement.prototype.getContext = () =>
      new Proxy({}, { get: (_, p) => () => {} });
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
    });
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 900 });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 600 });
    window.TestRenderer = class {
      constructor() {
        this.domElement = window.document.createElement('canvas');
        this.capabilities = { maxTextureSize: 2048, getMaxAnisotropy: () => 8 };
      }
      setPixelRatio() {}
      setSize() {}
      render() {
        this.frames = (this.frames || 0) + 1;
      }
      dispose() {}
    };
  },
});
const wait = () => new Promise((r) => setTimeout(r, 160));
(async () => {
  await wait();
  assert.deepStrictEqual(errors, [], 'Editor starts without DOM errors');
  const window = dom.window,
    document = window.document;
  for (const [buttonId, dialogId, contentId, closeId, heading] of [
    ['open-help', 'help-dialog', 'help-dialog-content', 'close-help', 'Getting started'],
    [
      'open-dev-help',
      'dev-help-dialog',
      'dev-help-dialog-content',
      'close-dev-help',
      'Architecture',
    ],
  ]) {
    const dialog = document.getElementById(dialogId),
      content = document.getElementById(contentId);
    assert.equal(content.children.length, 0, 'Documentation is rendered on demand');
    document.getElementById(buttonId).click();
    assert(dialog.open);
    assert.equal(content.querySelector('h2').textContent, heading);
    assert(content.querySelector('strong, code'), 'Markdown inline formatting is rendered');
    document.getElementById(closeId).click();
    assert(!dialog.open);
    document.getElementById(buttonId).click();
    dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(!dialog.open, 'Clicking the dialog backdrop closes it');
  }
  document.getElementById('edit-plan-title').click();
  const titleInput = document.getElementById('plan-title-input');
  assert(titleInput, 'The optional title editor can be created');
  titleInput.value = 'TypeScript plan';
  titleInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(document.getElementById('plan-title').textContent, 'TypeScript plan');
  assert.equal(document.getElementById('plan-title-input'), null);
  document.getElementById('load-template').click();
  await wait();
  assert.equal(document.querySelectorAll('.wall-section').length, 7);
  const toggle = document.getElementById('three-toggle');
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));
  await wait();
  const test = window.editorTest;
  assert(test.threePreview.renderer);
  assert.equal(test.threePreview.entries.size, 7);
  assert.equal(test.threePreview.camera.up.z, 1);
  assert.equal(test.threePreview.camera.up.y, 0);
  assert(Math.abs(test.threePreview.grid.rotation.x - Math.PI / 2) < 1e-9);
  assert(test.threePreview.renderer.frames > 0);
  const preview = test.threePreview;
  preview.controls.target.set(0.6, 0.4, 0.3);
  preview.camera.position.set(-4, 7, 6);
  preview.controls.update();
  const direction = () => preview.camera.position.clone().sub(preview.controls.target).normalize();
  const beforeFit = direction();
  document.getElementById('three-fit').click();
  assert(direction().distanceTo(beforeFit) < 1e-9, 'Fit room preserves the current viewing angle');
  const roomDistance = preview.camera.position.distanceTo(preview.controls.target);
  const markerToggle = document.getElementById('three-light-toggle');
  const firstId = test.planService.data.lights3d[0].id,
    firstLight = test.threePreview.lights.get(firstId);
  assert.equal(firstLight.marker.visible, false);
  markerToggle.checked = true;
  markerToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert(firstLight.marker.visible && firstLight.helper.visible && firstLight.aimMarker.visible);
  document.getElementById('three-fit').click();
  assert(
    Math.abs(preview.camera.position.distanceTo(preview.controls.target) - roomDistance) < 1e-9,
    'Light helpers do not enlarge room bounds',
  );
  assert(direction().distanceTo(beforeFit) < 1e-9);
  document.getElementById('three-top').click();
  assert(direction().z > 0.999, 'Top explicitly changes the angle');
  const topDirection = direction();
  document.getElementById('three-fit').click();
  assert(direction().distanceTo(topDirection) < 1e-9);
  document.getElementById('three-perspective').click();
  assert(direction().z < 0.9, 'Perspective explicitly changes the angle');
  const controls = document.getElementById('light-controls');
  const input = (card, label) =>
    [...card.querySelectorAll('label')]
      .find((node) => node.textContent === label)
      .querySelector('input');
  const edit = (field, value) => {
    field.value = value;
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  edit(input(controls, 'Position Z'), '2700');
  await wait();
  assert.equal(test.planService.data.lights3d[0].z, 2700);
  assert.equal(firstLight.light.position.z, 2.7);
  assert.equal(firstLight.marker.position.z, 2.7);
  assert(document.getElementById('source').value.includes('    z: 2700'));
  [...controls.querySelectorAll('button')]
    .find((button) => button.textContent === 'Add directional light')
    .click();
  await wait();
  assert.equal(test.planService.data.lights3d.length, 2);
  assert.equal(test.threePreview.lights.size, 2);
  const cards = controls.querySelectorAll('.group-card');
  assert.equal(cards.length, 2);
  edit(input(cards[1], 'Position X'), '-2200');
  edit(input(cards[1], 'Aim X'), '1250');
  edit(input(cards[1], 'Aim Y'), '500');
  edit(input(cards[1], 'Aim Z'), '1800');
  await wait();
  const secondId = test.planService.data.lights3d[1].id,
    secondLight = test.threePreview.lights.get(secondId);
  assert.equal(secondLight.light.position.x, -2.2);
  assert.equal(secondLight.light.target.position.x, 1.25);
  assert.equal(secondLight.light.target.position.y, 0.5);
  assert.equal(secondLight.aimMarker.position.z, 1.8);
  assert.equal(firstLight.light.target.position.z, 0);
  assert(secondLight.marker.visible);
  edit(input(cards[1], 'Light color'), '#8040ff');
  edit(input(cards[1], 'Intensity'), '1.7');
  await wait();
  assert.equal(secondLight.light.color.getHexString(), '8040ff');
  assert.equal(secondLight.light.intensity, 1.7);
  assert.equal(firstLight.light.color.getHexString(), 'ffffff');
  assert.equal(firstLight.light.intensity, 2.5);
  assert(document.getElementById('source').value.includes('color: "#8040ff"'));
  const snapshot = test.planService.snapshot();
  for (const codec of [test.YamlCodec, test.SvgCodec])
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(codec.decode(codec.encode(snapshot)).lights3d)),
      JSON.parse(JSON.stringify(snapshot.lights3d)),
    );
  cards[1].querySelector('.remove-element').click();
  document.querySelector('.confirm-remove').click();
  await wait();
  assert.equal(test.planService.data.lights3d.length, 1);
  assert.equal(test.threePreview.lights.size, 1);
  assert(!test.threePreview.scene.children.includes(secondLight.light));
  markerToggle.checked = false;
  markerToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert.equal(firstLight.marker.visible, false);
  assert.equal(firstLight.aimMarker.visible, false);
  assert.equal(firstLight.light.intensity, 2.5);
  test.planService.setPlacement3d('floor', 'x', 725);
  await wait();
  assert.equal(test.threePreview.entries.get('floor').group.position.x, 0.725);
  test.planService.setObjectValue('floor', 0, 'depth', 500);
  await wait();
  const box = test.threePreview.entries
    .get('floor')
    .surface.children.find((n) => n.userData.type === 'object');
  assert.equal(box.geometry.parameters.depth, 0.5);
  const source = document.getElementById('source');
  source.value = 'draft yaml';
  source.dispatchEvent(new window.Event('input'));
  test.planService.setPlacement3d('floor', 'z', 100);
  await wait();
  assert.equal(source.value, 'draft yaml');
  test.selection.select({ type: 'object', wallId: 'floor', objectName: 'douche', objectIndex: 0 });
  await wait();
  assert(document.querySelector('.wall-section').open, '3D selection opens the wall controls');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));
  assert(document.getElementById('preview-3d').hidden);
  assert(!document.getElementById('preview').hidden);
  assert.deepStrictEqual(errors, []);
  console.log(
    'Passed: bundled startup, template/sidebar, 3D mode, scene construction, reactive placement/depth, unapplied YAML protection, selection, 2D return. GPU rendering mocked.',
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  dom.window.close();
  process.exit(1);
});
