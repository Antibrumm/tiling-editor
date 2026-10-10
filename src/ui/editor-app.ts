import type { Plan } from '../model/types';
import type { PlanChange } from '../model/events';

import { ThreePreview } from '../rendering/three-preview';
import { YamlCodec } from '../codecs/yaml';
import { SvgCodec } from '../codecs/svg';

import { PlanService } from '../model/plan-service';

import { batch } from '@preact/signals';
import type { Signal } from '@preact/signals';
import type { ViewBox, ViewState } from '../ui/types';
import { EditorState } from '../ui/editor-state';
import { ViewController } from '../ui/view-controller';

import { UiFeedback } from '../ui/feedback';
import { TitleController } from '../ui/title-controller';

import { Selection } from '../ui/selection';

import { CanvasRenderer } from '../rendering/canvas-renderer';
import { YamlSourceEditor } from '../ui/yaml-source-editor';

interface EditorAppDependencies {
  editorState: EditorState;
  yamlEditingSignal: Signal<boolean>;
  resetSnapshot: Plan;
  establishWallResetSnapshots: () => void;
  selection: Selection;
  threePreview: ThreePreview;
  baseBox: ViewBox;
  EMPTY_VIEW_BOX: ViewBox;
  view: ViewState;
  titleController: TitleController;
  viewController: ViewController;
  ActionConsole: { log(message: string): void; clear(): void };
  yamlCodec: YamlCodec;
  svgCodec: SvgCodec;
  sourceStatus: HTMLElement;
  uiFeedback: UiFeedback;
  uploadPlanInput: HTMLInputElement;
}
export class EditorApp {
  constructor(
    public planService: PlanService,
    public canvasRenderer: CanvasRenderer,
    public sourceEditor: YamlSourceEditor,
    private dependencies: EditorAppDependencies,
  ) {
    this.planService = planService;
    this.canvasRenderer = canvasRenderer;
    this.sourceEditor = sourceEditor;
  }

  replaceDocument(
    plan: Plan,
    {
      change = { type: 'replace' },
      establishResetPoint = false,
      fitView = true,
    }: { change?: PlanChange; establishResetPoint?: boolean; fitView?: boolean } = {},
  ) {
    batch(() => {
      this.planService.replaceData(plan, change);
      this.dependencies.editorState.interactionPlan = null;
      this.dependencies.yamlEditingSignal.value = false;
    });
    if (establishResetPoint) {
      this.dependencies.resetSnapshot = this.planService.snapshot();
      this.dependencies.establishWallResetSnapshots();
    }
    this.dependencies.selection.clear();
    this.dependencies.threePreview.needsFit = true;
    const canvas = this.planService.data.canvas;
    this.dependencies.baseBox =
      canvas.width > 0 && canvas.height > 0
        ? [canvas.x, canvas.y, canvas.width, canvas.height]
        : [...this.dependencies.EMPTY_VIEW_BOX];
    this.dependencies.view.box = [...this.dependencies.baseBox];
    this.dependencies.view.scale = 1;
    this.dependencies.titleController.update();
    if (fitView) this.dependencies.viewController.fitView();
  }

  loadUploadedPlan(file: File | undefined) {
    if (!file) return;
    this.dependencies.ActionConsole.log(`Loading “${file.name}”…`);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || ''),
          name = file.name.toLowerCase();
        const isYaml =
          name.endsWith('.yaml') ||
          name.endsWith('.yml') ||
          /yaml/i.test(file.type) ||
          (!name.endsWith('.svg') && /^\s*format\s*:\s*tiling-plan\b/m.test(text));
        let plan = isYaml
          ? this.dependencies.yamlCodec.decode(text)
          : this.dependencies.svgCodec.decode(text);
        const fileBase = file.name.replace(/\.(?:svg|ya?ml)$/i, '').trim();
        if (!plan.name || plan.name === 'Tiling plan') plan.name = fileBase || 'Tiling plan';
        this.replaceDocument(plan, {
          change: { type: 'upload', kind: isYaml ? 'YAML' : 'SVG' },
          establishResetPoint: true,
          fitView: true,
        });
        this.dependencies.sourceStatus.textContent = `Uploaded ${isYaml ? 'YAML' : 'SVG'} loaded as YAML source.`;
        this.dependencies.sourceStatus.classList.remove('error');
        this.dependencies.uiFeedback.message(`${file.name} loaded.`);
        this.dependencies.ActionConsole.log(`Loaded “${file.name}” (${isYaml ? 'YAML' : 'SVG'}).`);
      } catch (error) {
        this.dependencies.uiFeedback.message(
          'Invalid plan: ' + (error instanceof Error ? error.message : String(error)),
        );
        this.dependencies.ActionConsole.log(
          `Load failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.dependencies.uploadPlanInput.value = '';
      }
    };
    reader.readAsText(file);
  }
}
