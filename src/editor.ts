import { ActionConsole } from './ui/action-console';
import { ModelChangeLog } from './ui/model-change-log';
import { ControlPanel } from './ui/control-panel';
import { ReorderController } from './ui/reorder-controller';
import { ConfirmationDialog } from './ui/confirmation-dialog';
import { EditorState } from './ui/editor-state';
import { ViewController } from './ui/view-controller';
import { SourcePresentation } from './ui/source-presentation';
import { UiFeedback } from './ui/feedback';
import { TitleController } from './ui/title-controller';
import { CanvasViewport } from './ui/canvas-viewport';
import { RenderScheduler } from './rendering/render-scheduler';
import { Selection } from './ui/selection';
import { PointerController } from './ui/pointer-controller';
import { CanvasRenderer } from './rendering/canvas-renderer';
import { YamlSourceEditor } from './ui/yaml-source-editor';
import { EditorApp } from './ui/editor-app';
import type { ViewBox, ViewState } from './ui/types';
import './styles.css';
import { initializeDocumentation } from './ui/documentation';
import baseModelYaml from './assets/base-model.yaml?raw';
import { getElement, get2DContext } from './dom';
import type { Plan, Wall, PlanObject } from './model/types';

import { createPatternPainter } from './rendering/pattern-painter';
import { ThreePreview } from './rendering/three-preview';
import { YamlCodec } from './codecs/yaml';
import { SvgCodec } from './codecs/svg';

import { PlanService } from './model/plan-service';
import { PlanNormalizer } from './model/plan-normalizer';
import { ScenePlacement } from './model/scene-placement';
import { GeometryTools } from './model/geometry';
import { HitTester } from './model/hit-tester';

import { signal, computed, effect } from '@preact/signals';
function init() {
  const normalizer: PlanNormalizer = new PlanNormalizer();
  const yamlCodec: YamlCodec = new YamlCodec(normalizer);
  const svgCodec: SvgCodec = new SvgCodec(normalizer);
  const scenePlacement: ScenePlacement = new ScenePlacement();
  const geometryTools: GeometryTools = new GeometryTools();
  const planService: PlanService = new PlanService({}, () => publishPersistentPlan(), normalizer);
  const planSignal = signal(planService.snapshot());
  const interactionPlanSignal = signal<Plan | null>(null);
  const lightVisibleSignal = signal(false);
  const yamlEditingSignal = signal(false);
  const selectedWallIdSignal = signal<string | null>(null);
  const selectedLightIdSignal = signal<string | null>(null);
  const selectedObjectNameSignal = signal<string | null>(null);
  const selectedObjectIndexSignal = signal<number | null>(null);
  const effectivePlan = computed(() => interactionPlanSignal.value || planSignal.value);
  const publishPersistentPlan = () => {
    planSignal.value = planService.snapshot();
  };
  const wallResetSnapshots = new Map<string, Wall>();
  const objectResetSnapshots = new Map<string, PlanObject[]>();
  const establishWallResetSnapshots = () => {
    wallResetSnapshots.clear();
    objectResetSnapshots.clear();
    for (const wall of planService.data.walls) {
      wallResetSnapshots.set(wall.name, structuredClone(wall));
      objectResetSnapshots.set(
        wall.name,
        wall.objects.map((object) => structuredClone(object)),
      );
    }
  };
  const resetWallToLoadedState = (wallName: string) => {
    const baseline = wallResetSnapshots.get(wallName);
    if (!baseline) {
      uiFeedback.message(`No loaded state is available for ${wallName}.`);
      return;
    }
    if (!planService.resetWall(wallName, baseline)) {
      uiFeedback.message(`Could not reset ${wallName}.`);
      return;
    }
    wallResetSnapshots.delete(wallName);
    wallResetSnapshots.set(baseline.name, structuredClone(baseline));
    if (editorState.selectedWallId === wallName) editorState.selectedWallId = baseline.name;
    objectResetSnapshots.delete(wallName);
    objectResetSnapshots.set(
      baseline.name,
      baseline.objects.map((object) => structuredClone(object)),
    );
    uiFeedback.message(`${baseline.name} reset.`);
  };
  const resetObjectToLoadedState = (wallName: string, objectIndex: number) => {
    const baseline = objectResetSnapshots.get(wallName)?.[objectIndex];
    const object = planService.wall(wallName)?.objects[objectIndex];
    if (!baseline || !object) {
      uiFeedback.message('No loaded state is available for this element.');
      return;
    }
    if (!planService.resetObject(wallName, objectIndex, baseline)) {
      uiFeedback.message(`Could not reset ${object.name || 'element'}.`);
      return;
    }
    objectResetSnapshots.get(wallName)![objectIndex] = structuredClone(baseline);
    uiFeedback.message(`${baseline.name || 'Element'} reset.`);
  };
  const viewController: ViewController = new ViewController({
    get splitToggle() {
      return splitToggle;
    },
    get sourceToggle() {
      return sourceToggle;
    },
    get threeToggle() {
      return threeToggle;
    },
    get viewPanels() {
      return viewPanels;
    },
    get preview() {
      return preview;
    },
    get threeContainer() {
      return threeContainer;
    },
    get threePreview() {
      return threePreview;
    },
    get sourceView() {
      return sourceView;
    },
    get zoomLevel() {
      return zoomLevel;
    },
    get view() {
      return view;
    },
    get canvasRenderer() {
      return canvasRenderer;
    },
    effectivePlan,
    get renderScheduler() {
      return renderScheduler;
    },
    get viewport() {
      return viewport;
    },
    geometryTools,
    get baseBox() {
      return baseBox;
    },
    set baseBox(value: ViewBox) {
      baseBox = value;
    },
  });
  const sourcePresentation: SourcePresentation = new SourcePresentation({
    get highlightCode() {
      return highlightCode;
    },
    get source() {
      return source;
    },
    get highlight() {
      return highlight;
    },
  });
  const uiFeedback: UiFeedback = new UiFeedback({
    get status() {
      return status;
    },
  });
  const titleController: TitleController = new TitleController({
    planService,
    get planTitle() {
      return planTitle;
    },
    get editPlanTitle() {
      return editPlanTitle;
    },
  });
  const preview = getElement('preview');
  const stage = getElement('canvas-stage');
  const canvas = getElement('plan-canvas');
  const ctx = get2DContext(canvas);
  const showLabels = getElement('show-labels');
  const showDimensions = getElement('show-dimensions');
  showLabels.addEventListener('change', () => viewController.drawCanvas());
  showDimensions.addEventListener('change', () => viewController.drawCanvas());
  const zoomLevel = getElement('zoom-level');
  const EMPTY_VIEW_BOX: ViewBox = [0, 0, 3000, 3000];
  let baseBox: ViewBox = [...EMPTY_VIEW_BOX];
  const view: ViewState = { scale: 1, box: [...baseBox] };
  const source = getElement('source');
  const highlight = getElement('source-highlight');
  const highlightCode = getElement('highlight-code');
  const sourceStatus = getElement('source-status');
  const tileControls = getElement('tile-controls');
  const lightControls = getElement('light-controls');
  const wallControls = getElement('wall-controls');
  const status = getElement('status');
  const actionConsoleLog = getElement('action-console-log');
  const actionConsole = new ActionConsole(actionConsoleLog);
  getElement('clear-action-log').addEventListener('click', () => actionConsole.clear());
  actionConsole.log('Editor ready — no template loaded.');
  const controlPanel = new ControlPanel({
    planService,
    uiFeedback,
    selectedWallIdSignal,
    selectedLightIdSignal,
    selectedObjectIndexSignal,
    get selection() {
      return selection;
    },
    resetObjectToLoadedState,
    scenePlacement,
    effectivePlan,
    resetWallToLoadedState,
    lightControls,
    tileControls,
    wallControls,
    reorder: new ReorderController(planService),
    confirmation: new ConfirmationDialog(),
  });
  const sidebarMount = document.createElement('div');
  wallControls.parentNode!.append(sidebarMount);
  const editorState: EditorState = new EditorState();
  Object.defineProperty(editorState, 'interactionPlan', {
    get: () => interactionPlanSignal.value,
    set: (value: Plan | null) => {
      interactionPlanSignal.value = value;
    },
  });
  Object.defineProperties(editorState, {
    selectedLightId: {
      get: () => selectedLightIdSignal.value,
      set: (value: string | null) => {
        selectedLightIdSignal.value = value;
      },
    },
    selectedWallId: {
      get: () => selectedWallIdSignal.value,
      set: (value: string | null) => {
        selectedWallIdSignal.value = value;
      },
    },
    selectedObjectName: {
      get: () => selectedObjectNameSignal.value,
      set: (value: string | null) => {
        selectedObjectNameSignal.value = value;
      },
    },
    selectedObjectIndex: {
      get: () => selectedObjectIndexSignal.value,
      set: (value: number | null) => {
        selectedObjectIndexSignal.value = value;
      },
    },
  });

  const threeToggle = getElement('three-toggle');
  const threeContainer = getElement('preview-3d');
  threeToggle.addEventListener('change', () => viewController.updateViewMode());
  const sourceToggle = getElement('source-toggle');
  const splitToggle = getElement('split-toggle');
  const sourceView = getElement('source-view');
  const viewPanels = getElement('view-panels');
  sourceToggle.addEventListener('change', () => {
    if (sourceToggle.checked) splitToggle.checked = false;
    viewController.updateViewMode();
  });
  splitToggle.addEventListener('change', () => {
    if (splitToggle.checked) sourceToggle.checked = false;
    viewController.updateViewMode();
  });
  const viewport: CanvasViewport = new CanvasViewport(canvas, view, () =>
    viewController.updateView(),
  );
  const renderScheduler: RenderScheduler = new RenderScheduler(() =>
    viewController.drawCanvasNow(),
  );
  new ResizeObserver(() => viewController.drawCanvas()).observe(stage);

  const hitTester: HitTester = new HitTester(() => effectivePlan.value);
  const selection: Selection = new Selection(editorState, () => viewController.drawCanvas());
  new PointerController(preview, viewport, hitTester, selection, planService, {
    editorState,
    planSignal,
    normalizer,
    interactionPlanSignal,
    geometryTools,
  });
  preview.addEventListener('dblclick', (event) => {
    if (!(event.target instanceof Element && event.target.closest('.zoom-controls')))
      viewController.fitView();
  });
  getElement('zoom-in').addEventListener('click', () => {
    const rect = preview.getBoundingClientRect();
    viewController.zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  getElement('zoom-out').addEventListener('click', () => {
    const rect = preview.getBoundingClientRect();
    viewController.zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  getElement('zoom-fit').addEventListener('click', () => viewController.fitView());
  let resetSnapshot = planService.snapshot();
  baseBox =
    planService.data.canvas.width > 0 && planService.data.canvas.height > 0
      ? [
          planService.data.canvas.x,
          planService.data.canvas.y,
          planService.data.canvas.width,
          planService.data.canvas.height,
        ]
      : [...EMPTY_VIEW_BOX];
  view.box = [...baseBox];

  source.addEventListener('scroll', () => {
    highlight.scrollTop = source.scrollTop;
    highlight.scrollLeft = source.scrollLeft;
  });
  const paintSurfacePattern = createPatternPainter(() => {
    viewController.drawCanvas();
    threePreview.textureRevision++;
    threePreview.request();
  });

  const threePreview: ThreePreview = new ThreePreview(
    threeContainer,
    {
      plan: () => effectivePlan.value,
      showLights: () => lightVisibleSignal.value,
      setShowLights: (value) => {
        lightVisibleSignal.value = value;
      },
      selectedWall: () => selectedWallIdSignal.value,
      selectedLight: () => selectedLightIdSignal.value,
      selectedObject: () => selectedObjectIndexSignal.value,
      select: (hit) => selection.select(hit),
    },
    paintSurfacePattern,
  );
  effect(() => {
    void effectivePlan.value;
    void lightVisibleSignal.value;
    void selectedLightIdSignal.value;
    void selectedWallIdSignal.value;
    void selectedObjectIndexSignal.value;
    threePreview.request();
  });
  const canvasRenderer: CanvasRenderer = new CanvasRenderer({
    stage,
    canvas,
    viewport,
    view,
    ctx,
    paintSurfacePattern,
    showLabels,
    showDimensions,
    editorState,
  });
  const yamlSourceEditor: YamlSourceEditor = new YamlSourceEditor({
    effectivePlan,
    yamlEditingSignal,
    source,
    yamlCodec,
    sourcePresentation,
    get app() {
      return app;
    },
    sourceStatus,
  });
  const app: EditorApp = new EditorApp(planService, canvasRenderer, yamlSourceEditor, {
    editorState,
    yamlEditingSignal,
    get resetSnapshot() {
      return resetSnapshot;
    },
    set resetSnapshot(value: Plan) {
      resetSnapshot = value;
    },
    establishWallResetSnapshots,
    selection,
    threePreview,
    get baseBox() {
      return baseBox;
    },
    set baseBox(value: ViewBox) {
      baseBox = value;
    },
    EMPTY_VIEW_BOX,
    view,
    titleController,
    viewController,
    actionConsole,
    yamlCodec,
    svgCodec,
    sourceStatus,
    uiFeedback,
    get uploadPlanInput() {
      return uploadPlanInput;
    },
  });
  effect(() => {
    void effectivePlan.value;
    renderScheduler.request();
  });
  effect(() => {
    const plan = effectivePlan.value;
    if (!yamlEditingSignal.value) yamlSourceEditor.syncFromPlan(plan);
  });
  effect(() => {
    void effectivePlan.value;
    void selectedWallIdSignal.value;
    void selectedObjectIndexSignal.value;
    void selectedLightIdSignal.value;
    controlPanel.render(sidebarMount);
  });
  const modelChangeLog = new ModelChangeLog();
  planService.onEvent((change) => {
    const message = modelChangeLog.describe(change);
    if (message) actionConsole.log(message);
  });
  planService.onEvent((change) => {
    if (!change) return;
    if (change.type === 'light-remove' && selectedLightIdSignal.value === change.lightId)
      selection.clear();
    if (change.type === 'wall-rename' && wallResetSnapshots.has(change.oldName)) {
      const baseline = wallResetSnapshots.get(change.oldName);
      wallResetSnapshots.delete(change.oldName);
      wallResetSnapshots.set(change.newName, baseline!);
      if (objectResetSnapshots.has(change.oldName)) {
        const objectBaselines = objectResetSnapshots.get(change.oldName);
        objectResetSnapshots.delete(change.oldName);
        objectResetSnapshots.set(change.newName, objectBaselines!);
      }
    } else if (change.type === 'wall-add') {
      const wall = planService.wall(change.wallName);
      if (wall && !wallResetSnapshots.has(change.wallName))
        wallResetSnapshots.set(change.wallName, structuredClone(wall));
      if (wall && !objectResetSnapshots.has(change.wallName))
        objectResetSnapshots.set(
          change.wallName,
          wall.objects.map((object) => structuredClone(object)),
        );
    } else if (change.type === 'wall-remove') {
      wallResetSnapshots.delete(change.wallName);
      objectResetSnapshots.delete(change.wallName);
    } else if (change.type === 'object-add') {
      const object = planService.wall(change.wallName)?.objects[change.index];
      if (object) {
        const baselines = objectResetSnapshots.get(change.wallName) || [];
        baselines.splice(change.index, 0, structuredClone(object));
        objectResetSnapshots.set(change.wallName, baselines);
      }
    } else if (change.type === 'object-reorder') {
      const baselines = objectResetSnapshots.get(change.wallName);
      if (baselines && baselines[change.fromIndex]) {
        const [baseline] = baselines.splice(change.fromIndex, 1);
        baselines.splice(change.toIndex, 0, baseline);
      }
      if (
        editorState.selectedWallId === change.wallName &&
        editorState.selectedObjectIndex !== null
      ) {
        const selected = editorState.selectedObjectIndex;
        if (selected === change.fromIndex) editorState.selectedObjectIndex = change.toIndex;
        else if (change.fromIndex < selected && selected <= change.toIndex)
          editorState.selectedObjectIndex = selected - 1;
        else if (change.toIndex <= selected && selected < change.fromIndex)
          editorState.selectedObjectIndex = selected + 1;
      }
    } else if (change.type === 'object-remove') {
      objectResetSnapshots.get(change.wallName)?.splice(change.index, 1);
    }
  });
  const uploadPlan = getElement('upload-plan');
  const uploadPlanInput = getElement('upload-plan-input');
  const loadTemplateButton = getElement('load-template');
  loadTemplateButton.addEventListener('click', () => {
    actionConsole.log('Loading template…');
    try {
      const plan = yamlCodec.decode(baseModelYaml);
      app.replaceDocument(plan, {
        change: { type: 'template' },
        establishResetPoint: true,
        fitView: true,
      });
      sourceStatus.textContent = 'Template loaded.';
      sourceStatus.classList.remove('error');
      uiFeedback.message('Template loaded.');
      actionConsole.log('Template loaded.');
    } catch (error) {
      uiFeedback.message(
        'Could not load template: ' + (error instanceof Error ? error.message : String(error)),
      );
      actionConsole.log(
        'Template load failed: ' + (error instanceof Error ? error.message : String(error)),
      );
    }
  });
  uploadPlanInput.addEventListener('change', () =>
    app.loadUploadedPlan(uploadPlanInput.files?.[0]),
  );
  for (const type of ['dragenter', 'dragover'])
    uploadPlan.addEventListener(type, (event) => {
      event.preventDefault();
      uploadPlan.classList.add('dragover');
    });
  for (const type of ['dragleave', 'drop'])
    uploadPlan.addEventListener(type, (event) => {
      event.preventDefault();
      uploadPlan.classList.remove('dragover');
    });
  uploadPlan.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find(
      (file) =>
        /\.(svg|ya?ml)$/i.test(file.name) ||
        file.type === 'image/svg+xml' ||
        /yaml/i.test(file.type),
    );
    if (file) app.loadUploadedPlan(file);
    else uiFeedback.message('Choose an SVG, YAML, or YML plan file.');
  });

  source.addEventListener('input', () => {
    yamlEditingSignal.value = true;
    sourcePresentation.updateHighlight();
    sourceStatus.textContent = 'Unapplied YAML changes.';
    sourceStatus.classList.remove('error');
  });
  source.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      yamlSourceEditor.apply.bind(yamlSourceEditor)();
    }
  });
  getElement('apply-source').addEventListener(
    'click',
    yamlSourceEditor.apply.bind(yamlSourceEditor),
  );
  const addWallButton = getElement('add-wall');
  const addWallFromControls = (event?: Event) => {
    if (event) event.preventDefault();
    try {
      let index = 1;
      while (planService.data.walls.some((wall) => wall.name === `wall-${index}`)) index++;
      const id = `wall-${index}`;
      const bounds = geometryTools.planBounds(planService.data);
      const x = Math.ceil((bounds ? bounds.maxX : 0) + 100);
      const y = planService.data.walls.length ? planService.data.walls[0].y : 0;
      const pattern = planService.data.patterns.length ? planService.data.patterns[0].name : '';
      planService.addWall({
        name: id,
        x,
        y,
        rotation: 0,
        outline: {
          points: [
            [0, 0],
            [3000, 0],
            [3000, 2150],
            [0, 2150],
          ],
          pattern,
          patternX: 0,
          patternY: 0,
          fill: 'white',
          stroke: 'red',
          strokeWidth: 1,
        },
      });
      viewController.fitView();
      uiFeedback.message(`${id} added.`);
    } catch (error) {
      uiFeedback.message(
        'Could not add wall: ' + (error instanceof Error ? error.message : 'Unknown error.'),
      );
      viewController.drawCanvas();
    }
  };
  addWallButton.addEventListener('click', addWallFromControls);

  const planTitle = getElement('plan-title');
  const editPlanTitle = getElement('edit-plan-title');
  editPlanTitle.addEventListener('click', () => titleController.beginEdit());
  planService.onEvent((change) => {
    if (change && change.type === 'name-change') titleController.update();
  });
  titleController.update();

  initializeDocumentation();

  getElement('reset').addEventListener('click', () => {
    app.replaceDocument(resetSnapshot, {
      change: { type: 'reset' },
      establishResetPoint: false,
      fitView: true,
    });
    sourceStatus.textContent = 'Plan reset.';
    sourceStatus.classList.remove('error');
    uiFeedback.message('Plan reset.');
  });
  getElement('copy').addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(source.value);
        uiFeedback.message('YAML source copied.');
      } catch {
        uiFeedback.message('Clipboard unavailable. Select the source and copy it manually.');
      }
    })();
  });
  getElement('download-yaml').addEventListener('click', () => {
    const blob: Blob = new Blob([yamlCodec.encode(planService.snapshot())], {
      type: 'text/yaml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${titleController.downloadBaseName()}.yaml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    uiFeedback.message('YAML downloaded.');
  });
  getElement('download').addEventListener('click', () => {
    const blob: Blob = new Blob([svgCodec.encode(planService.snapshot())], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${titleController.downloadBaseName()}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    uiFeedback.message('SVG downloaded.');
  });
  getElement('download-png').addEventListener('click', () => {
    viewController.drawCanvasNow();
    canvas.toBlob((blob) => {
      if (!blob) {
        uiFeedback.message('Could not create PNG.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${titleController.downloadBaseName()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      uiFeedback.message('PNG downloaded.');
    }, 'image/png');
  });
  publishPersistentPlan();
  viewController.updateView();
}

init();
