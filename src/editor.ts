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
import type { Plan, Wall, PlanObject, Pattern, Point } from './model/types';
import type { PlanChange } from './model/events';
import type { ComponentChildren, JSX } from 'preact';

import { createPatternPainter } from './rendering/pattern-painter';
import { ThreePreview } from './rendering/three-preview';
import { YamlCodec } from './codecs/yaml';
import { SvgCodec } from './codecs/svg';
import { number } from './codecs/format';
import { PlanService } from './model/plan-service';
import { PlanNormalizer } from './model/plan-normalizer';
import { ScenePlacement } from './model/scene-placement';
import { GeometryTools } from './model/geometry';
import { HitTester } from './model/hit-tester';

import { h, render, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { signal, computed, effect } from '@preact/signals';
type ReorderType = 'pattern' | 'wall' | 'object';
interface NumberFieldProps {
  label: string;
  value: number;
  onInput(value: number): void;
  min?: number;
  max?: number;
  range?: boolean;
  unit?: string;
}
interface ButtonProps {
  children?: ComponentChildren;
  onClick: JSX.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}
interface PatternSelectProps {
  value: string;
  onChange(value: string): void;
  patterns: Pattern[];
}
interface EditableNameProps {
  title: string;
  onRename(value: string): void;
  onRemove?: () => void;
  kind: string;
}
interface CardProps {
  title: string;
  children?: ComponentChildren;
  onRename?: (value: string) => void;
  onRemove?: () => void;
  kind?: string;
  reorder?: [ReorderType, number, string?];
  selected?: boolean;
  defaultOpen?: boolean;
}
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
  showLabels.addEventListener('change', viewController.drawCanvas);
  showDimensions.addEventListener('change', viewController.drawCanvas);
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
  const ActionConsole = {
    log(message: string) {
      const line = document.createElement('div');
      line.className = 'action-console-line';
      const now = new Date();
      const stamp = ([now.getHours(), now.getMinutes(), now.getSeconds()] as const)
        .map((value) => String(value).padStart(2, '0'))
        .join(':');
      line.textContent = stamp + '  ' + message;
      actionConsoleLog.appendChild(line);
      while (actionConsoleLog.children.length > 80)
        actionConsoleLog.removeChild(actionConsoleLog.firstChild!);
      actionConsoleLog.scrollTop = actionConsoleLog.scrollHeight;
    },
    clear() {
      actionConsoleLog.textContent = '';
    },
  };
  getElement('clear-action-log').addEventListener('click', () => ActionConsole.clear());
  ActionConsole.log('Editor ready — no template loaded.');

  // The plan stays plain data; each persistent operation publishes a fresh snapshot.
  const NumberField = ({
    label,
    value,
    onInput,
    min = -10000,
    max = 10000,
    range = false,
    unit = ' mm',
  }: NumberFieldProps) =>
    h(
      'label',
      { class: range ? 'slider-label' : undefined },
      range
        ? h(
            'span',
            { class: 'slider-heading' },
            h('span', null, label),
            h('output', null, `${number(Number(value) || 0)}${unit}`),
          )
        : label,
      h('input', {
        type: range ? 'range' : 'number',
        value: number(Number(value) || 0),
        min,
        max,
        step: 1,
        onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
          onInput(Number(event.currentTarget.value)),
      }),
    );
  const Button = ({ children, onClick, className = 'add-element' }: ButtonProps) =>
    h('button', { type: 'button', class: className, onClick }, children);
  const PatternSelect = ({ value, onChange, patterns }: PatternSelectProps) =>
    h(
      'label',
      null,
      'Pattern',
      h(
        'select',
        {
          value: value || '',
          onChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
            onChange(e.currentTarget.value),
        },
        h('option', { value: '' }, 'No pattern'),
        patterns.map((p) => h('option', { key: p.name, value: p.name }, p.name)),
      ),
    );
  function confirmRemoval(message: string, onConfirm: () => void) {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML =
      '<p></p><div class="confirm-dialog-actions"><button type="button">Cancel</button><button type="button" class="confirm-remove">Remove</button></div>';
    dialog.querySelector('p')!.textContent = message;
    document.body.append(dialog);
    const close = () => {
      dialog.close();
      dialog.remove();
    };
    dialog.querySelector('button')!.onclick = close;
    dialog.querySelector<HTMLButtonElement>('.confirm-remove')!.onclick = () => {
      close();
      onConfirm();
    };
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    dialog.showModal();
  }
  function EditableName({ title, onRename, onRemove, kind }: EditableNameProps) {
    const [editing, setEditing] = useState(false),
      input = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (editing) {
        input.current?.focus();
        input.current?.select();
      }
    }, [editing]);
    const finish = (commit: boolean) => {
      if (commit) onRename(input.current?.value || '');
      setEditing(false);
    };
    return h(
      'span',
      { class: 'control-name' },
      editing
        ? h('input', {
            ref: input,
            class: 'control-name-input',
            defaultValue: title,
            onClick: (e: JSX.TargetedEvent<HTMLInputElement, MouseEvent>) => e.stopPropagation(),
            onPointerDown: (e: JSX.TargetedEvent<HTMLInputElement, PointerEvent>) =>
              e.stopPropagation(),
            onBlur: () => finish(true),
            onKeyDown: (e: JSX.TargetedEvent<HTMLInputElement, KeyboardEvent>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
              }
            },
          })
        : h('strong', null, title),
      h(
        'button',
        {
          type: 'button',
          class: 'control-name-edit',
          'aria-label': `Edit ${title} name`,
          title: 'Edit name',
          onPointerDown: (e: JSX.TargetedEvent<HTMLButtonElement, PointerEvent>) =>
            e.preventDefault(),
          onClick: (e: JSX.TargetedEvent<HTMLButtonElement, MouseEvent>) => {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          },
        },
        '✎',
      ),
      onRemove &&
        h(
          'button',
          {
            type: 'button',
            class: 'control-name-remove',
            'aria-label': `Remove ${kind} ${title}`,
            onClick: (e: JSX.TargetedEvent<HTMLButtonElement, MouseEvent>) => {
              e.preventDefault();
              e.stopPropagation();
              confirmRemoval(`Remove ${kind} “${title}”?`, onRemove);
            },
          },
          '×',
        ),
    );
  }
  let activeReorderDrag: { type: ReorderType; index: number; wallName: string } | null = null;
  const reorderHandlers = (
    type: ReorderType,
    index: number,
    wallName = '',
  ): Pick<JSX.HTMLAttributes<HTMLDetailsElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> => ({
    onDragOver: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      if (
        !activeReorderDrag ||
        activeReorderDrag.type !== type ||
        (type === 'object' && activeReorderDrag.wallName !== wallName)
      )
        return;
      e.preventDefault();
      e.currentTarget.classList.toggle(
        'drop-before',
        e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2,
      );
      e.currentTarget.classList.toggle(
        'drop-after',
        !e.currentTarget.classList.contains('drop-before'),
      );
    },
    onDragLeave: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      e.currentTarget.classList.remove('drop-before', 'drop-after');
    },
    onDrop: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      const payload = activeReorderDrag;
      e.currentTarget.classList.remove('drop-before', 'drop-after');
      if (!payload || payload.type !== type || (type === 'object' && payload.wallName !== wallName))
        return;
      e.preventDefault();
      e.stopPropagation();
      let target =
        index +
        (e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2
          ? 0
          : 1);
      if (payload.index < target) target--;
      if (type === 'pattern') planService.reorderPattern(payload.index, target);
      else if (type === 'wall') planService.reorderWall(payload.index, target);
      else planService.reorderObject(wallName, payload.index, target);
      activeReorderDrag = null;
    },
  });
  const ReorderHandle = ({
    type,
    index,
    wallName = '',
  }: {
    type: ReorderType;
    index: number;
    wallName?: string;
  }) =>
    h(
      'span',
      {
        class: 'reorder-handle',
        draggable: true,
        role: 'button',
        'aria-label': 'Drag to reorder',
        title: 'Drag to reorder',
        onClick: (e: JSX.TargetedEvent<HTMLSpanElement, MouseEvent>) => {
          e.preventDefault();
          e.stopPropagation();
        },
        onDragStart: (e: JSX.TargetedEvent<HTMLSpanElement, DragEvent>) => {
          e.stopPropagation();
          activeReorderDrag = { type, index, wallName };
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/plain', 'reorder');
        },
        onDragEnd: () => {
          activeReorderDrag = null;
          document
            .querySelectorAll('.drop-before,.drop-after')
            .forEach((node) => node.classList.remove('drop-before', 'drop-after'));
        },
      },
      '⋮⋮',
    );
  function Card({
    title,
    children,
    onRename,
    onRemove,
    kind = 'item',
    reorder,
    selected = false,
    defaultOpen = false,
  }: CardProps) {
    const ref = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
      if (!selected) return;
      const node = ref.current;
      if (node) {
        node.open = true;
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, [selected]);
    return h(
      'details',
      {
        class: 'group-card',
        ref,
        open: defaultOpen ? true : undefined,
        ...(reorder ? reorderHandlers(...reorder) : {}),
      },
      h(
        'summary',
        { class: 'group-top' },
        reorder && h(ReorderHandle, { type: reorder[0], index: reorder[1], wallName: reorder[2] }),
        onRename ? h(EditableName, { title, onRename, onRemove, kind }) : h('strong', null, title),
      ),
      children,
    );
  }
  const PatternRegions = ({ wall, patterns }: { wall: Wall; patterns: Pattern[] }) =>
    h(
      'div',
      { class: 'pattern-regions' },
      wall.patternRegions.map((r, i) =>
        h(
          Card,
          { key: i, title: `Pattern region ${i + 1}`, defaultOpen: true },
          h(
            'div',
            { class: 'coords' },
            ...(['x', 'y', 'width', 'height'] as const).map((key) =>
              h(NumberField, {
                key,
                label: key[0].toUpperCase() + key.slice(1),
                value: r[key],
                min: key === 'width' || key === 'height' ? 0 : -10000,
                onInput: (v) => planService.setPatternRegion(wall.name, i, key, v),
              }),
            ),
            h(PatternSelect, {
              value: r.pattern,
              patterns,
              onChange: (v) => planService.setPatternRegion(wall.name, i, 'pattern', v),
            }),
            ...(['patternX', 'patternY'] as const).map((key) =>
              h(NumberField, {
                key,
                label: key === 'patternX' ? 'Pattern X' : 'Pattern Y',
                value: r[key],
                min: -6000,
                max: 6000,
                range: true,
                onInput: (v) => planService.setPatternRegion(wall.name, i, key, v),
              }),
            ),
            h(NumberField, {
              label: 'Pattern rotation',
              value: r.patternRotation,
              min: 0,
              max: 359,
              range: true,
              unit: '°',
              onInput: (v) => planService.setPatternRegion(wall.name, i, 'patternRotation', v),
            }),
            h(
              Button,
              {
                className: 'remove-element wide',
                onClick: () => planService.removePatternRegion(wall.name, i),
              },
              'Remove region',
            ),
          ),
        ),
      ),
      h(
        Button,
        {
          onClick: () =>
            planService.addPatternRegion(wall.name, {
              x: 0,
              y: 0,
              width: 600,
              height: 600,
              pattern: patterns[0]?.name || '',
            }),
        },
        'Add pattern region',
      ),
    );
  function PatternCard({ p, index }: { p: Pattern; index: number }) {
    const set = (key: string, value: unknown) => planService.setPatternValue(p.name, key, value);
    return h(
      Card,
      {
        title: p.name,
        onRename: (v) => planService.renamePattern(p.name, v),
        onRemove: () => {
          if (!planService.removePattern(p.name))
            uiFeedback.message(`Pattern “${p.name}” is still used by a wall.`);
        },
        kind: 'tile pattern',
        reorder: ['pattern', index],
      },
      h(
        'div',
        { class: 'coords' },
        ...(
          [
            ['tileWidth', 'Tile width', 1, 6000],
            ['tileHeight', 'Tile height', 1, 6000],
            ['borderSize', 'Border size', 0, 1000],
          ] as const
        ).map(([key, label, min, max]) =>
          h(NumberField, { key, label, value: p[key], min, max, onInput: (v) => set(key, v) }),
        ),
        h(
          'label',
          null,
          'Tile',
          h('input', {
            type: 'color',
            value: /^#[0-9a-f]{6}$/i.test(p.tileColor) ? p.tileColor : '#ffffff',
            onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
              set('tileColor', e.currentTarget.value),
          }),
        ),
        h(
          'label',
          null,
          'Border',
          h('input', {
            type: 'color',
            value: /^#[0-9a-f]{6}$/i.test(p.borderColor) ? p.borderColor : '#888888',
            onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
              set('borderColor', e.currentTarget.value),
          }),
        ),
        h(
          'div',
          { class: 'wide' },
          h(Button, { onClick: () => planService.duplicatePattern(p.name) }, 'Duplicate pattern'),
          h(
            Button,
            {
              onClick: (e: JSX.TargetedEvent<HTMLElement, MouseEvent>) =>
                (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click(),
            },
            p.tileTexture ? 'Replace texture' : 'Upload texture',
          ),
          h('input', {
            type: 'file',
            accept: 'image/*',
            hidden: true,
            onChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
              const file = e.currentTarget.files?.[0];
              if (file) {
                const reader: FileReader = new FileReader();
                reader.onload = () => set('tileTexture', String(reader.result || ''));
                reader.readAsDataURL(file);
              }
            },
          }),
          p.tileTexture && h(Button, { onClick: () => set('tileTexture', '') }, 'Remove texture'),
        ),
        h(
          'label',
          { class: 'wide' },
          h('input', {
            type: 'checkbox',
            checked: !!p.randomTextureRotation,
            style: 'width:auto;display:inline-block;margin:0 7px 0 0',
            onChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
              set('randomTextureRotation', e.currentTarget.checked),
          }),
          'Random texture rotation',
        ),
      ),
    );
  }
  function ObjectCard({ wall, o, index }: { wall: Wall; o: PlanObject; index: number }) {
    const selected =
      selectedWallIdSignal.value === wall.name && selectedObjectIndexSignal.value === index;
    return h(
      Card,
      {
        title: o.name,
        key: index,
        selected,
        onRename: (v) => planService.setObjectValue(wall.name, index, 'name', v),
        onRemove: () => {
          planService.removeObject(wall.name, index);
          if (selected) selection.clear();
        },
        kind: 'element',
        reorder: ['object', index, wall.name],
      },
      h(
        Button,
        { className: 'card-reset', onClick: () => resetObjectToLoadedState(wall.name, index) },
        'Reset element',
      ),
      h(
        'div',
        { class: 'coords' },
        ...(
          [
            ['x', 'X', -6000, 6000],
            ['y', 'Y', -6000, 6000],
            ['width', 'Width', 1, 6000],
            ['height', 'Height', 1, 6000],
          ] as const
        ).map(([key, label, min, max]) =>
          h(NumberField, {
            key,
            label,
            value: o[key],
            min,
            max,
            range: true,
            onInput: (v) =>
              planService.setObjectValue(
                wall.name,
                index,
                key,
                key === 'x' || key === 'y' ? Math.round(v) : v,
              ),
          }),
        ),
        h(NumberField, {
          label: '3D depth / floor height',
          value: o.depth,
          min: 1,
          max: 6000,
          onInput: (v) => planService.setObjectValue(wall.name, index, 'depth', v),
        }),
        h(
          'label',
          null,
          'Fill',
          h('input', {
            type: 'color',
            value: /^#[0-9a-f]{6}$/i.test(o.fill) ? o.fill : '#ff0000',
            onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
              planService.setObjectValue(wall.name, index, 'fill', e.currentTarget.value),
          }),
        ),
      ),
    );
  }
  function PlacementControls({ wall, index }: { wall: Wall; index: number }) {
    const placement = wall.placement3d || scenePlacement.suggest(effectivePlan.value, wall, index);
    return h(
      Card,
      { title: '3D placement' },
      h(
        'div',
        { class: 'coords' },
        h(
          'p',
          { class: 'wide hint' },
          wall.placement3d
            ? 'Explicit placement. X/Y locate the surface on the ground; Z is elevation.'
            : 'Suggested placement. Floor lies on XY; Z is elevation. Edit a value to save explicit placement.',
        ),
        h(
          'label',
          { class: 'wide' },
          'Surface',
          h(
            'select',
            {
              value: placement.type,
              onChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
                planService.setPlacement3d(wall.name, 'type', e.currentTarget.value),
            },
            h('option', { value: 'wall' }, 'Vertical wall'),
            h('option', { value: 'floor' }, 'Horizontal floor'),
          ),
        ),
        ...(['x', 'y', 'z'] as const).map((key) =>
          h(NumberField, {
            key,
            label: '3D ' + key.toUpperCase(),
            value: placement[key],
            min: -50000,
            max: 50000,
            onInput: (v) => planService.setPlacement3d(wall.name, key, v),
          }),
        ),
        h(NumberField, {
          label: '3D angle',
          value: placement.yaw,
          min: -360,
          max: 360,
          range: true,
          unit: '°',
          onInput: (v) => planService.setPlacement3d(wall.name, 'yaw', v),
        }),
      ),
    );
  }
  function WallSection({
    wall,
    index,
    patterns,
  }: {
    wall: Wall;
    index: number;
    patterns: Pattern[];
  }) {
    const selected = selectedWallIdSignal.value === wall.name,
      section = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
      if (selected && section.current) {
        section.current.closest<HTMLDetailsElement>('#walls-section')!.open = true;
        section.current.open = true;
        section.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, [selected]);
    return h(
      'details',
      { class: 'wall-section control-section', ref: section, ...reorderHandlers('wall', index) },
      h(
        'summary',
        null,
        h(ReorderHandle, { type: 'wall', index }),
        h(EditableName, {
          title: wall.name,
          onRename: (v) => {
            const next = String(v).trim();
            if (planService.renameWall(wall.name, next) && selected)
              selectedWallIdSignal.value = next;
          },
          onRemove: () => {
            planService.removeWall(wall.name);
            if (selected) selection.clear();
          },
          kind: 'wall',
        }),
      ),
      h(
        'div',
        { class: 'wall-content' },
        h(
          Card,
          { title: wall.name, selected: selected && selectedObjectIndexSignal.value === null },
          h(
            Button,
            { className: 'card-reset', onClick: () => resetWallToLoadedState(wall.name) },
            'Reset wall',
          ),
          h(
            'div',
            { class: 'coords' },
            ...(['x', 'y', 'rotation'] as const).map((key) =>
              h(NumberField, {
                key,
                label: key === 'rotation' ? 'Rotation' : key.toUpperCase(),
                value: wall[key],
                min: key === 'rotation' ? 0 : -10000,
                max: key === 'rotation' ? 359 : 10000,
                range: true,
                unit: key === 'rotation' ? '' : ' mm',
                onInput: (v) =>
                  planService.setWallValue(wall.name, key, key === 'rotation' ? v : Math.round(v)),
              }),
            ),
            h(PatternSelect, {
              value: wall.outline.pattern,
              patterns,
              onChange: (v) => planService.setOutlineValue(wall.name, 'pattern', v),
            }),
            ...(['patternX', 'patternY'] as const).map((key) =>
              h(NumberField, {
                key,
                label: key === 'patternX' ? 'Pattern X' : 'Pattern Y',
                value: wall.outline[key],
                min: -6000,
                max: 6000,
                range: true,
                onInput: (v) =>
                  planService.setPatternTranslation(
                    wall.name,
                    key === 'patternX' ? v : wall.outline.patternX,
                    key === 'patternY' ? v : wall.outline.patternY,
                  ),
              }),
            ),
            h(NumberField, {
              label: 'Pattern rotation',
              value: wall.outline.patternRotation,
              min: 0,
              max: 359,
              range: true,
              unit: '°',
              onInput: (v) => planService.setOutlineValue(wall.name, 'patternRotation', v),
            }),
          ),
        ),
        h(PlacementControls, { wall, index }),
        h(PatternRegions, { wall, patterns }),
        h(
          Card,
          { title: 'outline' },
          h(
            'div',
            { class: 'coords' },
            h(
              'label',
              { class: 'wide' },
              'Points',
              h('textarea', {
                defaultValue: wall.outline.points
                  .map((p) => `${number(p[0])},${number(p[1])}`)
                  .join(' '),
                onInput: (e: JSX.TargetedEvent<HTMLTextAreaElement, Event>) => {
                  const points = e.currentTarget.value
                    .trim()
                    .split(/\s+/)
                    .map((pair) => pair.split(',').map(Number))
                    .filter((p): p is Point => p.length === 2 && p.every(Number.isFinite));
                  if (points.length >= 3) planService.setOutlinePoints(wall.name, points);
                },
              }),
            ),
          ),
        ),
        wall.objects.map((o, i) => h(ObjectCard, { key: i, wall, o, index: i })),
        h(
          Button,
          {
            onClick: () =>
              planService.addObject(wall.name, {
                name: 'element',
                x: 0,
                y: 0,
                width: 600,
                height: 600,
                fill: '#ff0000',
              }),
          },
          'Add element',
        ),
        h(
          Button,
          {
            onClick: () =>
              planService.setWallValue(wall.name, 'rotation', (wall.rotation + 90) % 360),
          },
          'Rotate 90°',
        ),
      ),
    );
  }
  function LightControls() {
    const lights = effectivePlan.value.lights3d;
    return h(
      Fragment,
      null,
      h(
        'p',
        { class: 'hint' },
        'Coordinates in mm. Position locates the light; Aim selects the point it illuminates. Z is height.',
      ),
      lights.map((light, index) =>
        h(
          Card,
          { key: light.id, title: 'Directional light ' + (index + 1), defaultOpen: true },
          h(
            'div',
            { class: 'coords' },
            h(
              'label',
              null,
              'Light color',
              h('input', {
                type: 'color',
                value: light.color,
                onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                  planService.setLightValue(light.id, 'color', event.currentTarget.value),
              }),
            ),
            h(
              'label',
              null,
              'Intensity',
              h('input', {
                type: 'number',
                value: light.intensity,
                min: 0,
                step: 0.1,
                onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                  planService.setLightValue(light.id, 'intensity', event.currentTarget.value),
              }),
            ),
            h('strong', { class: 'wide' }, 'Position'),
            ...(['x', 'y', 'z'] as const).map((key) =>
              h(NumberField, {
                key,
                label: 'Position ' + key.toUpperCase(),
                value: light[key],
                min: -50000,
                max: 50000,
                onInput: (value) => planService.setLightValue(light.id, key, value),
              }),
            ),
            h('strong', { class: 'wide' }, 'Aim'),
            ...(['aimX', 'aimY', 'aimZ'] as const).map((key) =>
              h(NumberField, {
                key,
                label: 'Aim ' + key.slice(-1),
                value: light[key],
                min: -50000,
                max: 50000,
                onInput: (value) => planService.setLightValue(light.id, key, value),
              }),
            ),
            h(
              Button,
              {
                className: 'remove-element wide',
                onClick: () =>
                  confirmRemoval('Remove this directional light?', () =>
                    planService.removeLight(light.id),
                  ),
              },
              'Remove light',
            ),
          ),
        ),
      ),
      h(Button, { onClick: () => planService.addLight() }, 'Add directional light'),
    );
  }
  function ControlPanelView() {
    const plan = effectivePlan.value;
    return h(
      Fragment,
      null,
      createPortal(h(LightControls, null), lightControls),
      createPortal(
        h(
          Fragment,
          null,
          plan.patterns.map((p, i) => h(PatternCard, { key: p.name, p, index: i })),
          h(
            Button,
            {
              onClick: () => {
                let i = 1,
                  n = `tile-pattern-${i}`;
                while (plan.patterns.some((p) => p.name === n)) n = `tile-pattern-${++i}`;
                planService.addPattern({
                  name: n,
                  tileWidth: 300,
                  tileHeight: 300,
                  borderSize: 0,
                  tileColor: '#ffffff',
                  borderColor: '#888888',
                });
              },
            },
            'Add tile pattern',
          ),
        ),
        tileControls,
      ),
      createPortal(
        h(
          Fragment,
          null,
          plan.walls.map((wall, i) =>
            h(WallSection, { key: wall.name, wall, index: i, patterns: plan.patterns }),
          ),
        ),
        wallControls,
      ),
    );
  }
  const sidebarMount = document.createElement('div');
  wallControls.parentNode!.append(sidebarMount);
  const editorState: EditorState = new EditorState();
  Object.defineProperty(editorState, 'interactionPlan', {
    get: () => interactionPlanSignal.value,
    set: (value) => {
      interactionPlanSignal.value = value;
    },
  });
  Object.defineProperties(editorState, {
    selectedWallId: {
      get: () => selectedWallIdSignal.value,
      set: (value) => {
        selectedWallIdSignal.value = value;
      },
    },
    selectedObjectName: {
      get: () => selectedObjectNameSignal.value,
      set: (value) => {
        selectedObjectNameSignal.value = value;
      },
    },
    selectedObjectIndex: {
      get: () => selectedObjectIndexSignal.value,
      set: (value) => {
        selectedObjectIndexSignal.value = value;
      },
    },
  });

  const threeToggle = getElement('three-toggle');
  const threeContainer = getElement('preview-3d');
  threeToggle.addEventListener('change', viewController.updateViewMode);
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
  const viewport: CanvasViewport = new CanvasViewport(canvas, view, viewController.updateView);
  const renderScheduler: RenderScheduler = new RenderScheduler(viewController.drawCanvasNow);
  new ResizeObserver(viewController.drawCanvas).observe(stage);

  const hitTester: HitTester = new HitTester(() => effectivePlan.value);
  const selection: Selection = new Selection(editorState, viewController.drawCanvas);
  const pointerController: PointerController = new PointerController(
    preview,
    viewport,
    hitTester,
    selection,
    planService,
    {
      editorState,
      planSignal,
      normalizer,
      interactionPlanSignal,
      geometryTools,
    },
  );
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
  getElement('zoom-fit').addEventListener('click', viewController.fitView);
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
      selectedObject: () => selectedObjectIndexSignal.value,
      select: (hit) => selection.select(hit),
    },
    paintSurfacePattern,
  );
  effect(() => {
    effectivePlan.value;
    lightVisibleSignal.value;
    selectedWallIdSignal.value;
    selectedObjectIndexSignal.value;
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
    ActionConsole,
    yamlCodec,
    svgCodec,
    sourceStatus,
    uiFeedback,
    get uploadPlanInput() {
      return uploadPlanInput;
    },
  });
  effect(() => {
    effectivePlan.value;
    renderScheduler.request();
  });
  effect(() => {
    const plan = effectivePlan.value;
    if (!yamlEditingSignal.value) yamlSourceEditor.syncFromPlan(plan);
  });
  effect(() => {
    effectivePlan.value;
    selectedWallIdSignal.value;
    selectedObjectIndexSignal.value;
    render(h(ControlPanelView, null), sidebarMount);
  });
  const ModelChangeLog = {
    describe(change: PlanChange) {
      if (!change || !change.type) return '';
      switch (change.type) {
        case 'light-change':
          return `Changed ${change.lightId} ${change.key} to ${change.value}${['color', 'intensity'].includes(change.key) ? '' : ' mm'}.`;
        case 'light-add':
          return `Added ${change.lightId}.`;
        case 'light-remove':
          return `Removed ${change.lightId}.`;
        case 'surface-placement':
          return `Changed 3D placement of “${change.wallName}” ${change.key} to ${change.value}.`;
        case 'wall-add':
          return `Added wall “${change.wallName}”.`;
        case 'wall-remove':
          return `Removed wall “${change.wallName}”.`;
        case 'wall-rename':
          return `Renamed wall “${change.oldName}” to “${change.newName}”.`;
        case 'wall-move':
          return `Dragged wall “${change.wallName}” to (${change.x}, ${change.y}).`;
        case 'wall-change':
          return `Changed wall “${change.wallName}” ${change.key} to ${change.value}.`;
        case 'wall-reset':
          return `Reset wall “${change.wallName}” to its loaded state.`;
        case 'object-add':
          return `Added element “${change.objectName || 'element'}” to wall “${change.wallName}”.`;
        case 'object-remove':
          return `Removed element “${change.objectName || 'element'}” from wall “${change.wallName}”.`;
        case 'object-reset':
          return `Reset element “${change.objectName || 'element'}” on wall “${change.wallName}” to its loaded state.`;
        case 'object-move':
          return `Dragged element “${change.objectName || 'element'}” on “${change.wallName}” to (${change.x}, ${change.y}).`;
        case 'object-change':
          return `Changed element “${change.objectName || 'element'}” on “${change.wallName}” ${change.key} to ${change.value}.`;
        case 'outline-change':
          return `Changed outline on “${change.wallName}” ${change.key} to ${change.value ?? 'none'}.`;
        case 'pattern-move':
          return `Translated pattern on “${change.wallName}” to (${change.x}, ${change.y}).`;
        case 'pattern-add':
          return `Added pattern “${change.patternName}”.`;
        case 'pattern-duplicate':
          return `Duplicated pattern “${change.patternName}” as “${change.newName}”.`;
        case 'pattern-remove':
          return `Removed pattern “${change.patternName}”.`;
        case 'pattern-rename':
          return `Renamed pattern “${change.oldName}” to “${change.newName}”.`;
        case 'pattern-change':
          return `Changed pattern “${change.patternName}” ${change.key} to ${change.value}.`;
        case 'pattern-region-add':
          return `Added pattern region ${change.index + 1} to “${change.wallName}”.`;
        case 'pattern-region-remove':
          return `Removed pattern region ${change.index + 1} from “${change.wallName}”.`;
        case 'pattern-region-change':
          return `Changed pattern region ${change.index + 1} on “${change.wallName}” ${change.key} to ${change.value}.`;
        case 'pattern-reorder':
          return `Reordered pattern “${change.patternName}”.`;
        case 'wall-reorder':
          return `Reordered wall “${change.wallName}”.`;
        case 'object-reorder':
          return `Reordered element “${change.objectName || 'element'}” on wall “${change.wallName}”.`;
        case 'name-change':
          return `Renamed plan to “${change.name}”.`;
        case 'source-apply':
          return 'Applied YAML source.';
        default:
          return '';
      }
    },
  };
  planService.onEvent((change) => {
    const message = ModelChangeLog.describe(change);
    if (message) ActionConsole.log(message);
  });
  planService.onEvent((change) => {
    if (!change) return;
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
    ActionConsole.log('Loading template…');
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
      ActionConsole.log('Template loaded.');
    } catch (error) {
      uiFeedback.message(
        'Could not load template: ' + (error instanceof Error ? error.message : String(error)),
      );
      ActionConsole.log(
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
        'Could not add wall: ' +
          (error && (error instanceof Error ? error.message : String(error))
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error)),
      );
      viewController.drawCanvas();
    }
  };
  addWallButton.addEventListener('click', addWallFromControls);

  const planTitle = getElement('plan-title');
  const editPlanTitle = getElement('edit-plan-title');
  editPlanTitle.addEventListener('click', titleController.beginEdit);
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
  getElement('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.value);
      uiFeedback.message('YAML source copied.');
    } catch {
      uiFeedback.message('Clipboard unavailable. Select the source and copy it manually.');
    }
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
