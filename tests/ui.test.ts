import type { Mesh, BoxGeometry } from 'three';
import type { DOMWindow } from 'jsdom';
import type { Signal, ReadonlySignal } from '@preact/signals';
import type { Plan } from '../src/model/types';
import type { ThreePreview } from '../src/rendering/three-preview';
import type { PlanService } from '../src/model/plan-service';
import type { Selection } from '../src/ui/selection';
import type { EditorState } from '../src/ui/editor-state';
import type { YamlCodec } from '../src/codecs/yaml';
import type { SvgCodec } from '../src/codecs/svg';
interface EditorWindow extends DOMWindow {
  editorTest: {
    threePreview: ThreePreview;
    planService: PlanService;
    selection: Selection;
    editorState: EditorState;
    effectivePlan: ReadonlySignal<Plan>;
    yamlEditingSignal: Signal<boolean>;
    yamlCodec: YamlCodec;
    svgCodec: SvgCodec;
  };
}
import { test, afterEach } from 'vitest';
import fs from 'node:fs';
import assert from 'node:assert';
import * as esbuild from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import ts from 'typescript';
const source = fs.readFileSync('src/editor.ts', 'utf8').replace("import './styles.css';", '');
// Instrument syntax nodes so formatting changes cannot silently disable tests.
const syntax = ts.createSourceFile(
  'editor.ts',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const edits: { position: number; text: string }[] = [];
function instrument(node: ts.Node) {
  if (ts.isNewExpression(node) && node.expression.getText(syntax) === 'ThreePreview') {
    const lastArgument = node.arguments![node.arguments!.length - 1];
    edits.push({ position: lastArgument.end, text: ', () => new window.TestRenderer()' });
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'init') {
    const publication = node.body!.statements.find(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        statement.expression.expression.getText(syntax) === 'publishPersistentPlan',
    )!;
    assert(publication, 'Editor exposes the initial model publication');
    edits.push({
      position: publication.getStart(syntax),
      text: 'window.editorTest={threePreview,planService,selection,editorState,effectivePlan,yamlEditingSignal,yamlCodec,svgCodec};\n',
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
const errors: string[] = [],
  vc = new VirtualConsole();
const paintedTexts: string[] = [];
let printCalls = 0;
const pdfDownloads: Blob[] = [];
const printUrls: string[] = [];
const pdfViewer = {
  closed: false,
  opener: null,
  location: { replace: (url: string) => printUrls.push(url) },
  close() {
    this.closed = true;
  },
};
vc.on('jsdomError', (e) => errors.push(e.message));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://editor.test/',
  virtualConsole: vc,
  beforeParse(window) {
    window.open = () => pdfViewer as unknown as Window;
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = (blob) => {
      assert('size' in blob);
      pdfDownloads.push(blob);
      return 'blob:https://editor.test/pdf';
    };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = () => {};
    window.print = () => {
      printCalls++;
    };
    window.HTMLCanvasElement.prototype.toDataURL = () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=';
    window.ResizeObserver = class {
      observe() {}
    };
    window.Path2D = class {
      moveTo() {}
      lineTo() {}
      closePath() {}
      rect() {}
      arc() {}
    };
    window.structuredClone = structuredClone;
    window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    window.HTMLCanvasElement.prototype.getContext = (() =>
      new Proxy(
        {},
        {
          get: (_, key) =>
            key === 'fillText' ? (text: string) => paintedTexts.push(text) : () => {},
        },
      )) as unknown as HTMLCanvasElement['getContext'];
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.getBoundingClientRect = () => new window.DOMRect(0, 0, 900, 600);
    Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 900 });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 600 });
    window.TestRenderer = class {
      domElement: HTMLCanvasElement;
      capabilities: { maxTextureSize: number; getMaxAnisotropy: () => number };
      frames = 0;
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
afterEach(() => dom.window.close());
const wait = () => new Promise((r) => setTimeout(r, 160));
test('editor startup, controls, selection, and reactive 3D preview', async () => {
  await wait();
  assert.deepStrictEqual(errors, [], 'Editor starts without DOM errors');
  const window = dom.window as unknown as EditorWindow,
    document = window.document;
  const dialog = (document.getElementById('help-dialog') as HTMLDialogElement)!;
  const content = (document.getElementById('help-dialog-content') as HTMLElement)!;
  assert.equal(content.children.length, 0, 'Documentation is rendered on demand');
  assert.equal(document.querySelectorAll<HTMLElement>('.help-button').length, 1);
  for (const [id, heading] of [
    ['user', 'Getting started'],
    ['developer', 'Architecture'],
  ]) {
    (document.getElementById('open-help') as HTMLButtonElement)!.click();
    assert(dialog.open);
    assert.equal(content.querySelectorAll<HTMLElement>('[data-document]').length, 3);
    assert(!content.querySelector<HTMLElement>('h2')!, 'Opening documentation shows the list');
    content.querySelector<HTMLElement>(`[data-document="${id}"]`)!.click();
    assert.equal(content.querySelector<HTMLElement>('h2')!.textContent, heading);
    assert(
      content.querySelector<HTMLElement>('strong, code')!,
      'Markdown inline formatting is rendered',
    );
    (document.getElementById('documentation-back') as HTMLButtonElement)!.click();
    assert.equal(content.querySelectorAll<HTMLElement>('[data-document]').length, 3);
    assert.equal(document.activeElement, content.querySelector<HTMLButtonElement>('button')!);
    (document.getElementById('close-help') as HTMLButtonElement)!.click();
    assert(!dialog.open);
    (document.getElementById('open-help') as HTMLButtonElement)!.click();
    dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(!dialog.open, 'Clicking the dialog backdrop closes it');
  }
  (document.getElementById('edit-plan-title') as HTMLButtonElement)!.click();
  const titleInput = (document.getElementById('plan-title-input') as HTMLInputElement)!;
  assert(titleInput, 'The optional title editor can be created');
  titleInput.value = 'TypeScript plan';
  titleInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(
    (document.getElementById('plan-title') as HTMLElement)!.textContent,
    'TypeScript plan',
  );
  assert.equal((document.getElementById('plan-title-input') as HTMLInputElement)!, null);
  (document.getElementById('load-example') as HTMLButtonElement)!.click();
  await wait();
  assert.equal(document.querySelectorAll<HTMLDetailsElement>('.wall-section').length, 7);
  assert(
    paintedTexts.some((text) => /: [\d,]+ tiles$/.test(text)),
    'Surface tile counts are painted',
  );
  const loadedPlan = window.editorTest.planService.data;
  const reportToggle = (document.getElementById('report-toggle') as HTMLInputElement)!;
  const report = (document.getElementById('report-view') as HTMLElement)!;
  const reportSnapshot = window.editorTest.planService.snapshot();
  reportToggle.checked = true;
  reportToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert(!report.hidden, 'Report view opens');
  assert((document.getElementById('preview') as HTMLElement)!.hidden, 'Report replaces the canvas');
  assert.equal(
    report.querySelectorAll<HTMLElement>('.report-wall').length,
    loadedPlan.walls.length,
  );
  assert.equal(
    report.querySelectorAll<HTMLElement>('.report-wall tbody tr').length,
    loadedPlan.walls.reduce((sum, wall) => sum + wall.patternRegions.length, 0),
  );
  assert(report.textContent.includes('m²') && report.textContent.includes('Selected tile'));
  const roomSummary = report.querySelector<HTMLElement>('.report-room-summary')!;
  assert(
    roomSummary.textContent.includes('Complete room') &&
      roomSummary.textContent.includes('Wall area:') &&
      roomSummary.textContent.includes('Tile region area:'),
  );
  const expectedTypes = new Map<string, { count: number; area: number }>();
  for (const row of report.querySelectorAll<HTMLElement>('.report-wall tbody tr')) {
    const cells = row.querySelectorAll<HTMLElement>('td');
    const name = cells[1].textContent;
    if (name === 'No tile selected') continue;
    const previous = expectedTypes.get(name)! || { count: 0, area: 0 };
    previous.count += Number(cells[2].textContent.replace(/[^\d]/g, ''));
    previous.area += Number(cells[0].textContent.split(' ')[0].replaceAll(',', ''));
    expectedTypes.set(name, previous);
  }
  const typeRows = report.querySelectorAll<HTMLElement>('.report-tile-totals tbody tr');
  assert.equal(typeRows.length, expectedTypes.size, 'Room lists each selected tile type once');
  for (const row of typeRows) {
    const expected = expectedTypes.get(row.querySelector<HTMLElement>('th')!.textContent)!;
    const cells = row.querySelectorAll<HTMLElement>('td');
    assert.equal(
      cells[1].textContent,
      expected.count.toLocaleString(),
      'Tile type count sums its regions across walls',
    );
    const actualArea = Number(cells[0].textContent.split(' ')[0].replaceAll(',', ''));
    assert(
      Math.abs(actualArea - expected.area) < 0.001,
      'Tile type area sums its regions across walls',
    );
  }
  assert.deepStrictEqual(
    window.editorTest.planService.snapshot(),
    reportSnapshot,
    'Viewing a report does not mutate the plan',
  );
  window.editorTest.planService.setName('Updated report title');
  await wait();
  assert.equal(
    report.querySelector<HTMLElement>('h2')!.textContent,
    'Updated report title',
    'Report updates with plan edits',
  );
  window.editorTest.planService.setName(reportSnapshot.name);
  reportToggle.checked = false;
  reportToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert(
    report.hidden && !(document.getElementById('preview') as HTMLElement)!.hidden,
    'Closing report restores the preview',
  );
  assert(
    loadedPlan.patterns.some((pattern) =>
      paintedTexts.some((text) => text.startsWith(`${pattern.name}: `) && text.endsWith(' tiles')),
    ),
    'Counts are labeled by pattern',
  );
  assert(
    !loadedPlan.walls.some((wall) =>
      paintedTexts.some((text) => text.startsWith(`${wall.name}: `) && text.endsWith(' tiles')),
    ),
    'Combined wall totals are omitted',
  );
  const tileCounts = (document.getElementById('show-tile-counts') as HTMLInputElement)!;
  paintedTexts.length = 0;
  tileCounts.checked = false;
  tileCounts.dispatchEvent(new window.Event('change'));
  await wait();
  assert(!paintedTexts.some((text) => / tiles$/.test(text)), 'Tile counts can be hidden');
  tileCounts.checked = true;
  tileCounts.dispatchEvent(new window.Event('change'));
  await wait();
  assert(
    paintedTexts.some((text) => / tiles$/.test(text)),
    'Tile counts can be restored',
  );
  const toggle = (document.getElementById('three-toggle') as HTMLInputElement)!;
  const placementSections = () =>
    [...document.querySelectorAll<HTMLDetailsElement>('.wall-content > .group-card')].filter(
      (card) => card.querySelector<HTMLElement>('summary')?.textContent === '3D placement',
    );
  assert.equal(placementSections().length, 0, 'Placement controls are hidden in 2D');
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));
  await wait();
  const test = window.editorTest;
  assert.equal(placementSections().length, 7, 'Placement controls appear with the 3D preview');
  assert(
    placementSections().every((card) => card === card.parentElement!.lastElementChild),
    'Placement is last in each wall section',
  );
  assert(test.threePreview.renderer);
  assert.equal(test.threePreview.entries.size, 7);
  assert.equal(test.threePreview.camera.up.z, 1);
  assert.equal(test.threePreview.camera.up.y, 0);
  assert(Math.abs(test.threePreview.grid.rotation.x - Math.PI / 2) < 1e-9);
  assert((test.threePreview.renderer as unknown as { frames: number }).frames > 0);
  const preview = test.threePreview;
  preview.controls.target.set(0.6, 0.4, 0.3);
  preview.camera.position.set(-4, 7, 6);
  preview.controls.update();
  const direction = () => preview.camera.position.clone().sub(preview.controls.target).normalize();
  const beforeFit = direction();
  (document.getElementById('three-fit') as HTMLButtonElement)!.click();
  assert(direction().distanceTo(beforeFit) < 1e-9, 'Fit room preserves the current viewing angle');
  const roomDistance = preview.camera.position.distanceTo(preview.controls.target);
  const markerToggle = (document.getElementById('three-light-toggle') as HTMLInputElement)!;
  const firstId = test.planService.data.lights3d[0].id,
    firstLight = test.threePreview.lights.get(firstId)!,
    initialIntensity = test.planService.data.lights3d[0].intensity;
  assert.equal(firstLight.marker.visible, false);
  markerToggle.checked = true;
  markerToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert(firstLight.marker.visible && firstLight.helper.visible && firstLight.aimMarker.visible);
  const lightSection = (document.getElementById(
    'light-controls',
  ) as HTMLElement)!.closest<HTMLDetailsElement>('details')!;
  lightSection.open = false;
  test.selection.select({ type: 'wall', wallId: 'floor' });
  for (const section of document.querySelectorAll<HTMLDetailsElement>(
    '.wall-section, #light-controls .group-card',
  ))
    section.open = true;
  test.threePreview.scene.updateMatrixWorld(true);
  test.threePreview.camera.updateMatrixWorld(true);
  const aimScreen = firstLight.aimMarker.position.clone().project(test.threePreview.camera);
  const previewRect = test.threePreview.renderer.domElement.getBoundingClientRect();
  test.threePreview.pick({
    clientX: previewRect.left + ((aimScreen.x + 1) / 2) * previewRect.width,
    clientY: previewRect.top + ((1 - aimScreen.y) / 2) * previewRect.height,
  } as PointerEvent);
  await wait();
  assert.equal(test.editorState.selectedLightId, firstId, 'Aim markers select their owning light');
  assert.equal(test.editorState.selectedWallId, null, 'Light selection clears surface selection');
  assert(lightSection.open, 'Selecting a light opens its sidebar section');
  assert(document.querySelector<HTMLDetailsElement>('#light-controls .group-card.selected')!);
  assert(
    [...document.querySelectorAll<HTMLDetailsElement>('.wall-section')].every(
      (section) => !section.open,
    ),
    'Selecting a light collapses wall sections',
  );
  assert(
    [
      ...document.querySelectorAll<HTMLDetailsElement>(
        '#light-controls .group-card:not(.selected)',
      ),
    ].every((section) => !section.open),
    'Selecting a light collapses other lights',
  );
  assert.equal(firstLight.marker.material.color.getHexString(), '37ae69');
  test.selection.select({ type: 'wall', wallId: 'floor' });
  await wait();
  assert.equal(test.editorState.selectedLightId, null, 'Surface selection clears light selection');
  assert(!lightSection.open, 'Selecting a wall collapses the light controls');
  assert(
    [...document.querySelectorAll<HTMLDetailsElement>('.wall-section')].filter(
      (section) => section.open,
    ).length === 1,
    'Selection opens only the selected wall section',
  );
  assert.equal(firstLight.marker.material.color.getHexString(), 'ffba45');
  (document.getElementById('three-fit') as HTMLButtonElement)!.click();
  assert(
    Math.abs(preview.camera.position.distanceTo(preview.controls.target) - roomDistance) < 1e-9,
    'Light helpers do not enlarge room bounds',
  );
  assert(direction().distanceTo(beforeFit) < 1e-9);
  (document.getElementById('three-top') as HTMLButtonElement)!.click();
  assert(direction().z > 0.999, 'Top explicitly changes the angle');
  const topDirection = direction();
  (document.getElementById('three-fit') as HTMLButtonElement)!.click();
  assert(direction().distanceTo(topDirection) < 1e-9);
  (document.getElementById('three-perspective') as HTMLButtonElement)!.click();
  assert(direction().z < 0.9, 'Perspective explicitly changes the angle');
  const controls = (document.getElementById('light-controls') as HTMLElement)!;
  const input = (card: HTMLElement, label: string) =>
    [...card.querySelectorAll<HTMLElement>('label')]
      .find(
        (node) =>
          (node.querySelector<HTMLElement>('.slider-heading > span')?.textContent ??
            node.textContent) === label,
      )!
      .querySelector<HTMLInputElement>('input')!;
  const edit = (field: HTMLInputElement, value: string | number) => {
    field.value = String(value);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  edit(input(controls, 'Position Z'), '2700');
  await wait();
  assert.equal(test.planService.data.lights3d[0].z, 2700);
  assert.equal(firstLight.light.position.z, 2.7);
  assert.equal(firstLight.marker.position.z, 2.7);
  assert((document.getElementById('source') as HTMLTextAreaElement)!.value.includes('    z: 2700'));
  [...controls.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Add directional light')!
    .click();
  await wait();
  assert.equal(test.planService.data.lights3d.length, 2);
  assert.equal(test.threePreview.lights.size, 2);
  const cards = controls.querySelectorAll<HTMLDetailsElement>('.group-card');
  assert.equal(cards.length, 2);
  edit(input(cards[1], 'Position X'), '-2200');
  edit(input(cards[1], 'Aim X'), '1250');
  edit(input(cards[1], 'Aim Y'), '500');
  edit(input(cards[1], 'Aim Z'), '1800');
  await wait();
  const secondId = test.planService.data.lights3d[1].id,
    secondLight = test.threePreview.lights.get(secondId)!;
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
  assert.equal(firstLight.light.intensity, initialIntensity);
  assert(
    (document.getElementById('source') as HTMLTextAreaElement)!.value.includes('color: "#8040ff"'),
  );
  const snapshot = test.planService.snapshot();
  for (const codec of [test.yamlCodec, test.svgCodec])
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(codec.decode(codec.encode(snapshot)).lights3d)),
      JSON.parse(JSON.stringify(snapshot.lights3d)),
    );
  assert(!controls.querySelector<HTMLElement>('.remove-element')!);
  const removeLight = cards[1].querySelector<HTMLElement>('summary .control-name-remove')!;
  assert.equal(removeLight.getAttribute('aria-label'), 'Remove light Directional light 2');
  const lightCardOpen = cards[1].open;
  removeLight.click();
  assert.equal(cards[1].open, lightCardOpen, 'Removing a light does not toggle its card');
  assert.equal(test.planService.data.lights3d.length, 2, 'Removal waits for confirmation');
  document.querySelector<HTMLButtonElement>('.confirm-dialog button')!.click();
  assert.equal(test.planService.data.lights3d.length, 2, 'Cancel keeps both lights');
  assert.equal(test.threePreview.lights.size, 2);
  removeLight.click();
  document.querySelector<HTMLElement>('.confirm-remove')!.click();
  await wait();
  assert.equal(test.planService.data.lights3d.length, 1);
  assert.equal(test.threePreview.lights.size, 1);
  assert(!test.threePreview.scene.children.includes(secondLight.light));
  [...controls.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent === 'Add conic light')!
    .click();
  await wait();
  const coneCard = controls.querySelectorAll<HTMLDetailsElement>('.group-card')[1];
  const coneId = test.planService.data.lights3d[1].id;
  const coneEntry = test.threePreview.lights.get(coneId)!;
  assert(coneEntry.light instanceof test.threePreview.THREE.SpotLight);
  assert(Math.abs(coneEntry.light.angle - Math.PI / 6) < 1e-9);
  coneCard.querySelector<HTMLElement>('summary')!.click();
  await wait();
  assert.equal(test.editorState.selectedLightId, coneId, 'Light card headers select lights');
  edit(input(coneCard, 'Cone angle'), '80');
  edit(input(coneCard, 'Position Z'), '3200');
  edit(input(coneCard, 'Aim Z'), '200');
  edit(input(coneCard, 'Light color'), '#ff8040');
  edit(input(coneCard, 'Intensity'), '3');
  await wait();
  assert.equal(test.planService.data.lights3d[1].angle, 80);
  assert(
    (document.getElementById('action-console-log') as HTMLElement)!.textContent.includes(
      'angle to 80°',
    ),
  );
  assert(Math.abs(coneEntry.light.angle - (40 * Math.PI) / 180) < 1e-9);
  assert.equal(coneEntry.light.position.z, 3.2);
  assert.equal(coneEntry.light.target.position.z, 0.2);
  assert.equal(coneEntry.light.intensity, 3);
  for (const codec of [test.yamlCodec, test.svgCodec])
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(codec.decode(codec.encode(test.planService.snapshot())).lights3d)),
      JSON.parse(JSON.stringify(test.planService.snapshot().lights3d)),
      'Both codecs preserve mixed light types and cone angles',
    );
  const typeSelect = coneCard.querySelector<HTMLSelectElement>('select')!;
  typeSelect.value = 'directional';
  typeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait();
  assert(
    test.threePreview.lights.get(coneId)!.light instanceof test.threePreview.THREE.DirectionalLight,
  );
  assert.equal(coneCard.querySelector<HTMLInputElement>('input[max="179"]')!, null);
  assert(!test.threePreview.scene.children.includes(coneEntry.light));
  typeSelect.value = 'conic';
  typeSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait();
  assert.equal(
    test.planService.data.lights3d[1].angle,
    80,
    'Changing type preserves the cone angle',
  );
  coneCard.querySelector<HTMLElement>('.control-name-remove')!.click();
  document.querySelector<HTMLElement>('.confirm-remove')!.click();
  await wait();
  assert.equal(
    test.editorState.selectedLightId,
    null,
    'Deleting the selected light clears selection',
  );
  assert.equal(test.threePreview.lights.size, 1);
  markerToggle.checked = false;
  markerToggle.dispatchEvent(new window.Event('change'));
  await wait();
  assert.equal(firstLight.marker.visible, false);
  assert.equal(firstLight.aimMarker.visible, false);
  test.selection.select({ type: 'light', lightId: firstId });
  test.threePreview.scene.updateMatrixWorld(true);
  test.threePreview.camera.updateMatrixWorld(true);
  const hiddenAimScreen = firstLight.aimMarker.position.clone().project(test.threePreview.camera);
  test.threePreview.pick({
    clientX: previewRect.left + ((hiddenAimScreen.x + 1) / 2) * previewRect.width,
    clientY: previewRect.top + ((1 - hiddenAimScreen.y) / 2) * previewRect.height,
  } as PointerEvent);
  await wait();
  assert.equal(test.editorState.selectedLightId, null, 'Hidden light markers cannot be picked');
  assert.equal(firstLight.light.intensity, initialIntensity);
  test.planService.setPlacement3d('floor', 'x', 725);
  await wait();
  assert.equal(test.threePreview.entries.get('floor')!.group.position.x, 0.725);
  test.planService.setObjectValue('floor', 0, 'depth', 500);
  await wait();
  const box = test.threePreview.entries
    .get('floor')!
    .surface.children.find((n) => n.userData.type === 'object')! as Mesh<BoxGeometry>;
  assert.equal(box.geometry.parameters.depth, 0.5);
  const source = (document.getElementById('source') as HTMLTextAreaElement)!;
  source.value = 'draft yaml';
  source.dispatchEvent(new window.Event('input'));
  test.planService.setPlacement3d('floor', 'z', 100);
  await wait();
  assert.equal(source.value, 'draft yaml');
  test.selection.select({ type: 'object', wallId: 'floor', objectName: 'douche', objectIndex: 0 });
  await wait();
  assert(
    document.querySelector<HTMLDetailsElement>('.wall-section')!.open,
    '3D selection opens the wall controls',
  );
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change'));
  assert((document.getElementById('preview-3d') as HTMLElement)!.hidden);
  assert(!(document.getElementById('preview') as HTMLElement)!.hidden);
  test.planService.addPattern({ name: 'reorder-test', tileWidth: 100, tileHeight: 100 });
  await wait();
  assert.equal(placementSections().length, 0, 'Placement controls disappear when 3D is disabled');
  const patternNames = Array.from(test.planService.data.patterns, (pattern) => pattern.name);
  const patternCards = document.querySelectorAll<HTMLDetailsElement>(
    '#tile-controls > .group-card',
  );
  assert.equal(patternCards.length, patternNames.length);
  const dragStart = new window.MouseEvent('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(dragStart, 'dataTransfer', { value: { setData() {} } });
  patternCards[0].querySelector<HTMLElement>('.reorder-handle')!.dispatchEvent(dragStart);
  patternCards[patternCards.length - 1].dispatchEvent(
    new window.MouseEvent('drop', { bubbles: true, cancelable: true, clientY: 700 }),
  );
  await wait();
  assert.deepStrictEqual(
    Array.from(test.planService.data.patterns, (pattern) => pattern.name),
    [...patternNames.slice(1), patternNames[0]],
    'Sidebar dragging reorders the persistent model',
  );
  assert.equal(source.value, 'draft yaml', 'Reordering preserves the unapplied source draft');
  const unusedPatternCard = [
    ...document.querySelectorAll<HTMLDetailsElement>('#tile-controls > .group-card'),
  ].find((card) =>
    card.querySelector<HTMLElement>('summary')!.textContent.includes('reorder-test'),
  )!;
  unusedPatternCard.querySelector<HTMLElement>('.control-name-remove')!.click();
  assert(document.querySelector<HTMLDialogElement>('.confirm-dialog')!.open);
  document.querySelector<HTMLButtonElement>('.confirm-dialog button')!.click();
  assert.equal(document.querySelector<HTMLDialogElement>('.confirm-dialog')!, null);
  assert(test.planService.data.patterns.some((pattern) => pattern.name === 'reorder-test'));
  const floorCard = [...document.querySelectorAll<HTMLDetailsElement>('.wall-section')].find(
    (card) => card.querySelector<HTMLElement>('summary')!.textContent.includes('floor'),
  )!;
  const fullWallToggle = floorCard.querySelector<HTMLInputElement>(
    '.pattern-regions input[type="checkbox"]',
  )!;
  assert(fullWallToggle.checked, 'Example tiling belongs to a full-wall region');
  const fullWallButton = () =>
    [...floorCard.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Add full-wall pattern',
    )!;
  assert(!fullWallButton(), 'Full-wall add button is hidden when a full-wall region exists');
  fullWallToggle.checked = false;
  fullWallToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait();
  assert.equal(test.planService.wall('floor')!.patternRegions[0].fullWall, false);
  assert(fullWallButton(), 'Full-wall add button returns when coverage is switched to a rectangle');
  assert(test.planService.wall('floor')!.patternRegions[0].width > 0);
  const regionToggle = floorCard.querySelector<HTMLInputElement>(
    '.pattern-regions input[type="checkbox"]',
  )!;
  regionToggle.checked = true;
  regionToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait();
  assert.equal(test.planService.wall('floor')!.patternRegions[0].fullWall, true);
  assert(!fullWallButton(), 'Full-wall add button hides again after enabling full-wall coverage');
  const insetInput = [...floorCard.querySelectorAll<HTMLElement>('label')]
    .find((label) => label.textContent.includes('Pattern inset (mm)'))!
    .querySelector<HTMLInputElement>('input')!;
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change'));
  await wait();
  const previousFloor = test.threePreview.entries.get('floor')!;
  const updatedInset = test.planService.wall('floor')!.outline.patternInset + 5;
  insetInput.value = String(updatedInset);
  insetInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait();
  assert.equal(test.planService.wall('floor')!.outline.patternInset, updatedInset);
  assert.notEqual(
    test.threePreview.entries.get('floor')!,
    previousFloor,
    'Inset edits refresh the baked 3D surface',
  );
  assert.equal(source.value, 'draft yaml', 'Inset edits preserve the unapplied source draft');
  const beforePrint = test.planService.snapshot();
  const cameraBeforePrint = test.threePreview.camera.position.clone();
  (document.getElementById('print-result') as HTMLButtonElement)!.click();
  await wait();
  assert.equal(printCalls, 0, 'Printing uses the PDF viewer instead of the HTML print dialog');
  assert.equal(printUrls.length, 1, 'Print opens the generated PDF URL');
  assert.equal(pdfDownloads.length, 1);
  assert.equal(pdfDownloads[0].type, 'application/pdf');
  assert(pdfDownloads[0].size > 1000);
  assert.equal(
    (document.getElementById('print-document') as HTMLElement)!,
    null,
    'No separate HTML print document is generated',
  );
  assert.deepStrictEqual(test.planService.snapshot(), beforePrint, 'Printing preserves plan data');
  assert(
    test.threePreview.camera.position.equals(cameraBeforePrint),
    'Printing preserves the camera angle',
  );
  assert.equal(source.value, 'draft yaml', 'Printing preserves the YAML draft');
  pdfViewer.close();
  (document.getElementById('download-pdf') as HTMLButtonElement)!.click();
  await wait();
  assert.equal(
    pdfDownloads.length,
    2,
    (document.getElementById('status') as HTMLElement)!.textContent,
  );
  assert.equal(pdfDownloads[0].type, 'application/pdf');
  assert(pdfDownloads[0].size > 1000);
  assert.equal(printCalls, 0, 'PDF download skips the print dialog');
  assert.deepStrictEqual(
    test.planService.snapshot(),
    beforePrint,
    'PDF export preserves plan data',
  );
  assert.equal(source.value, 'draft yaml', 'PDF export preserves the YAML draft');
  window.open = () => null;
  (document.getElementById('print-result') as HTMLButtonElement)!.click();
  await wait();
  assert.equal(pdfDownloads.length, 2, 'Blocked popup does not start PDF generation');
  assert((document.getElementById('status') as HTMLElement)!.textContent.includes('Allow popups'));
  assert(!(document.getElementById('print-result') as HTMLButtonElement)!.disabled);
  assert.deepStrictEqual(errors, []);
});
