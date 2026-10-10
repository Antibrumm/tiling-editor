import './styles.css';
import { initializeDocumentation } from './ui/documentation';
import baseModelYaml from './assets/base-model.yaml?raw';
import { getElement, get2DContext } from './dom';
import type {
  Plan,
  Wall,
  PlanObject,
  Pattern,
  Point,
  Position,
  SelectionHit,
  Bounds,
} from './model/types';
import type { PlanChange } from './model/events';
import type { ComponentChildren, JSX } from 'preact';
import type { PatternSurface } from './rendering/pattern-painter';
import { createPatternPainter } from './rendering/pattern-painter';
import { ThreePreview } from './rendering/three-preview';
import { YamlCodec } from './codecs/yaml';
import { SvgCodec } from './codecs/svg';
import { number } from './codecs/format';
import { PlanService, ScenePlacement } from './model/plan-service';
import { GeometryTools, HitTester } from './model/geometry';

import { h, render, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { signal, computed, effect, batch } from '@preact/signals';

type ViewBox = [number, number, number, number];
interface ViewState {
  scale: number;
  box: ViewBox;
}
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
interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startWorld: Position;
  hit: SelectionHit | null;
  target: { semantic: SelectionHit } | null;
  initial: number[] | null;
  dragPlan: Plan | null;
  wallRotation: number;
  moved: boolean;
  mode: 'drag' | 'pan';
}
function init() {
  'use strict';
  class EditorState {
    selectedWallId: string | null;
    selectedObjectName: string | null;
    selectedObjectIndex: number | null;
    interactionPlan: Plan | null;
    sourceVisible: boolean;
    splitView: boolean;
    constructor() {
      this.selectedWallId = null;
      this.selectedObjectName = null;
      this.selectedObjectIndex = null;
      this.sourceVisible = false;
      this.splitView = false;
      this.interactionPlan = null;
    }
  }
  const planService = new PlanService({}, () => publishPersistentPlan());
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
      UiFeedback.message(`No loaded state is available for ${wallName}.`);
      return;
    }
    if (!planService.resetWall(wallName, baseline)) {
      UiFeedback.message(`Could not reset ${wallName}.`);
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
    UiFeedback.message(`${baseline.name} reset.`);
  };
  const resetObjectToLoadedState = (wallName: string, objectIndex: number) => {
    const baseline = objectResetSnapshots.get(wallName)?.[objectIndex];
    const object = planService.wall(wallName)?.objects[objectIndex];
    if (!baseline || !object) {
      UiFeedback.message('No loaded state is available for this element.');
      return;
    }
    if (!planService.resetObject(wallName, objectIndex, baseline)) {
      UiFeedback.message(`Could not reset ${object.name || 'element'}.`);
      return;
    }
    objectResetSnapshots.get(wallName)![objectIndex] = structuredClone(baseline);
    UiFeedback.message(`${baseline.name || 'Element'} reset.`);
  };
  class ViewController {
    static updateViewMode() {
      const split = splitToggle.checked,
        showSource = sourceToggle.checked,
        showThree = threeToggle.checked;
      sourceToggle.disabled = split;
      splitToggle.disabled = showSource;
      viewPanels.classList.toggle('side-by-side', split);
      preview.hidden = showThree || (!split && showSource);
      threeContainer.hidden = !showThree || (!split && showSource);
      if (!threeContainer.hidden) threePreview.activate();
      sourceView.hidden = !split && !showSource;
      getElement('view-title').textContent = split
        ? (showThree ? '3D preview' : 'Preview') + ' + YAML source'
        : showSource
          ? 'YAML source'
          : showThree
            ? '3D preview'
            : 'Preview';
      requestAnimationFrame(ViewController.drawCanvas);
    }
    static updateView() {
      zoomLevel.textContent = Math.round(view.scale * 100) + '%';
      ViewController.drawCanvas();
    }
    static drawCanvasNow() {
      canvasRenderFrame = 0;
      CanvasRenderer.paint(effectivePlan.value);
    }
    static drawCanvas() {
      renderScheduler.request();
    }
    static zoomAt(factor: number, clientX: number, clientY: number) {
      viewport.zoomAt(clientX, clientY, factor);
    }
    static fittedDrawingBox(paddingRatio = 0.04): ViewBox | null {
      const plan = effectivePlan.value;
      const bounds = GeometryTools.planBounds(plan);
      if (!bounds) return null;
      const minY = plan.canvas.flipY - bounds.maxY,
        maxY = plan.canvas.flipY - bounds.minY;
      const width = bounds.maxX - bounds.minX,
        height = maxY - minY;
      if (!(width > 0 && height > 0)) return null;
      const pad = Math.max(width, height) * paddingRatio;
      return [bounds.minX - pad, minY - pad, width + pad * 2, height + pad * 2];
    }
    static fitView() {
      view.scale = 1;
      view.box = ViewController.fittedDrawingBox() || [...baseBox];
      ViewController.updateView();
    }
    static drawingBounds() {
      const bounds = GeometryTools.planBounds(effectivePlan.value);
      return bounds
        ? {
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
          }
        : null;
    }
  }
  class SourcePresentation {
    static escapeHtml(value: string) {
      return value.replace(
        /[&<>"]/g,
        (c) =>
          (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[
            c
          ],
      );
    }
    static updateHighlight() {
      highlightCode.innerHTML =
        source.value
          .split('\n')
          .map((line) => {
            if (/^\s*#/.test(line))
              return (
                '<span class="syntax-comment">' + SourcePresentation.escapeHtml(line) + '</span>'
              );
            const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*:\s*)(.*)$/);
            if (!match) return SourcePresentation.escapeHtml(line);
            const scalar = match[4],
              hs =
                scalar === '|' || scalar === '|-' || scalar === '|+'
                  ? '<span class="syntax-punctuation">' +
                    SourcePresentation.escapeHtml(scalar) +
                    '</span>'
                  : '<span class="syntax-value">' +
                    SourcePresentation.escapeHtml(scalar) +
                    '</span>';
            return (
              SourcePresentation.escapeHtml(match[1]) +
              '<span class="syntax-attribute">' +
              SourcePresentation.escapeHtml(match[2]) +
              '</span>' +
              SourcePresentation.escapeHtml(match[3]) +
              hs
            );
          })
          .join('\n') + '\n';
      highlight.scrollTop = source.scrollTop;
      highlight.scrollLeft = source.scrollLeft;
    }
  }
  class UiFeedback {
    static timer: ReturnType<typeof setTimeout> | undefined;
    static message(value: string) {
      status.textContent = value;
      clearTimeout(UiFeedback.timer);
      UiFeedback.timer = setTimeout(() => {
        status.textContent = '';
      }, 3500);
    }
  }
  class TitleController {
    static update() {
      const name = planService.name;
      planTitle.textContent = name;
      document.title = `${name} · Canvas editor`;
    }
    static downloadBaseName() {
      const safe = planService.name
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return safe || 'tiling-plan';
    }
    static beginEdit() {
      if (document.getElementById('plan-title-input')) return;
      const input = document.createElement('input');
      input.id = 'plan-title-input';
      input.className = 'title-input';
      input.type = 'text';
      input.value = planService.name;
      input.setAttribute('aria-label', 'Plan title');
      planTitle.hidden = true;
      editPlanTitle.before(input);
      input.focus();
      input.select();
      let finished = false;
      const finish = (commit: boolean) => {
        if (finished) return;
        finished = true;
        if (commit) planService.setName(input.value);
        input.remove();
        planTitle.hidden = false;
        TitleController.update();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true));
    }
  }
  const preview = getElement('preview');
  const stage = getElement('canvas-stage');
  const canvas = getElement('plan-canvas');
  const ctx = get2DContext(canvas);
  const showLabels = getElement('show-labels');
  const showDimensions = getElement('show-dimensions');
  showLabels.addEventListener('change', ViewController.drawCanvas);
  showDimensions.addEventListener('change', ViewController.drawCanvas);
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
            UiFeedback.message(`Pattern “${p.name}” is still used by a wall.`);
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
                const reader = new FileReader();
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
    const placement = wall.placement3d || ScenePlacement.suggest(effectivePlan.value, wall, index);
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
  const editorState = new EditorState();
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
  threeToggle.addEventListener('change', ViewController.updateViewMode);
  const sourceToggle = getElement('source-toggle');
  const splitToggle = getElement('split-toggle');
  const sourceView = getElement('source-view');
  const viewPanels = getElement('view-panels');
  sourceToggle.addEventListener('change', () => {
    if (sourceToggle.checked) splitToggle.checked = false;
    ViewController.updateViewMode();
  });
  splitToggle.addEventListener('change', () => {
    if (splitToggle.checked) sourceToggle.checked = false;
    ViewController.updateViewMode();
  });
  class CanvasViewport {
    minZoom: number;
    maxZoom: number;
    constructor(
      public canvas: HTMLCanvasElement,
      public view: ViewState,
      public onChange: () => void,
    ) {
      this.canvas = canvas;
      this.view = view;
      this.onChange = onChange;
      this.minZoom = 0.25;
      this.maxZoom = 30;
    }
    metrics() {
      const rect = this.canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / this.view.box[2], rect.height / this.view.box[3]);
      const width = this.view.box[2] * scale;
      const height = this.view.box[3] * scale;
      return {
        rect,
        scale,
        left: (rect.width - width) / 2,
        top: (rect.height - height) / 2,
        width,
        height,
      };
    }
    screenToWorld(clientX: number, clientY: number) {
      const viewport = this.metrics();
      return {
        x: this.view.box[0] + (clientX - viewport.rect.left - viewport.left) / viewport.scale,
        y: this.view.box[1] + (clientY - viewport.rect.top - viewport.top) / viewport.scale,
      };
    }
    screenToPlan(clientX: number, clientY: number) {
      return this.screenToWorld(clientX, clientY);
    }
    zoomAt(clientX: number, clientY: number, factor: number) {
      const next = Math.max(this.minZoom, Math.min(this.maxZoom, this.view.scale * factor));
      if (next === this.view.scale) return;
      const anchor = this.screenToWorld(clientX, clientY);
      const ratio = this.view.scale / next;
      this.view.box[0] = anchor.x - (anchor.x - this.view.box[0]) * ratio;
      this.view.box[1] = anchor.y - (anchor.y - this.view.box[1]) * ratio;
      this.view.box[2] *= ratio;
      this.view.box[3] *= ratio;
      this.view.scale = next;
      this.onChange?.();
    }
    panByScreenDelta(dx: number, dy: number) {
      const { scale } = this.metrics();
      if (!scale) return;
      this.view.box[0] -= dx / scale;
      this.view.box[1] -= dy / scale;
      this.onChange?.();
    }
  }
  const viewport = new CanvasViewport(canvas, view, ViewController.updateView);
  let canvasRenderToken = 0;
  let canvasRenderFrame = 0;
  class RenderScheduler {
    pending: boolean;
    constructor(public render: () => void) {
      this.render = render;
      this.pending = false;
    }
    request() {
      if (this.pending) return;
      this.pending = true;
      canvasRenderFrame = requestAnimationFrame(() => {
        this.pending = false;
        this.render();
      });
    }
  }
  const renderScheduler = new RenderScheduler(ViewController.drawCanvasNow);
  new ResizeObserver(ViewController.drawCanvas).observe(stage);
  class Selection {
    constructor(
      public state: EditorState,
      public requestRender: () => void,
    ) {
      this.state = state;
      this.requestRender = requestRender;
    }
    select(hit: SelectionHit | null) {
      this.state.selectedWallId = hit?.wallId || null;
      this.state.selectedObjectName = hit?.objectName || null;
      this.state.selectedObjectIndex = hit?.type === 'object' ? hit.objectIndex : null;
      this.requestRender?.();
    }
    clear() {
      this.select(null);
    }
  }

  class PointerController {
    gesture: Gesture | null;
    touchPoints: Map<number, Position>;
    pinch: { ids: number[]; distance: number; midX: number; midY: number } | null;
    clickThreshold: number;
    constructor(
      public element: HTMLElement,
      public viewport: CanvasViewport,
      public hitTester: HitTester,
      public selection: Selection,
      public planService: PlanService,
    ) {
      this.element = element;
      this.viewport = viewport;
      this.hitTester = hitTester;
      this.selection = selection;
      this.planService = planService;
      this.gesture = null;
      this.touchPoints = new Map();
      this.pinch = null;
      this.clickThreshold = 5;
      this.bind();
    }
    bind() {
      this.element.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          this.viewport.zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
        },
        { passive: false },
      );
      this.element.addEventListener('pointerdown', (event) => this.pointerDown(event));
      this.element.addEventListener('pointermove', (event) => this.pointerMove(event));
      this.element.addEventListener('pointerup', (event) => this.pointerUp(event));
      this.element.addEventListener('pointercancel', (event) => this.pointerCancel(event));
    }
    resolveTarget(hit: SelectionHit | null) {
      return hit ? { semantic: hit } : null;
    }
    pointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest('.zoom-controls')) return;
      if (event.pointerType === 'touch') {
        this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try {
          this.element.setPointerCapture(event.pointerId);
        } catch (_) {}
        if (this.touchPoints.size >= 2) {
          const points = [...this.touchPoints.entries()].slice(0, 2);
          const a = points[0][1],
            b = points[1][1];
          this.pinch = {
            ids: [points[0][0], points[1][0]],
            distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
          };
          this.gesture = null;
          editorState.interactionPlan = null;
          this.element.classList.add('dragging');
          event.preventDefault();
          return;
        }
      }
      if (event.button !== 0) return;
      const world = this.viewport.screenToWorld(event.clientX, event.clientY);
      const hit = this.hitTester.hitTest(world);
      const target = this.resolveTarget(hit);
      const dragPlan = hit && target ? structuredClone(planSignal.value) : null;
      const dragWall = hit ? PlanService.wallIn(dragPlan, hit.wallId) : null;
      const dragObject =
        hit?.type === 'object'
          ? dragWall?.objects[hit.objectIndex] ||
            dragWall?.objects.find((object) => object.name === hit.objectName)
          : null;
      const initial =
        hit?.type === 'wall' && dragWall
          ? [dragWall.x, dragWall.y]
          : hit?.type === 'object' && dragObject
            ? [dragObject.x, dragObject.y]
            : null;
      if (dragPlan) interactionPlanSignal.value = dragPlan;
      this.gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        startWorld: world,
        hit,
        target,
        initial,
        dragPlan,
        wallRotation: dragWall?.rotation || 0,
        moved: false,
        mode: hit && target ? 'drag' : 'pan',
      };
      if (hit) this.selection.select(hit);
      this.element.setPointerCapture(event.pointerId);
      this.element.classList.add('dragging');
    }
    pointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
        this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pinch) {
          const a = this.touchPoints.get(this.pinch.ids[0]);
          const b = this.touchPoints.get(this.pinch.ids[1]);
          if (a && b) {
            const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
            const midX = (a.x + b.x) / 2,
              midY = (a.y + b.y) / 2;
            this.viewport.panByScreenDelta(midX - this.pinch.midX, midY - this.pinch.midY);
            this.viewport.zoomAt(midX, midY, distance / this.pinch.distance);
            this.pinch.distance = distance;
            this.pinch.midX = midX;
            this.pinch.midY = midY;
            event.preventDefault();
            return;
          }
        }
      }
      const g = this.gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      const dx = event.clientX - g.startX;
      const dy = event.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) <= this.clickThreshold) return;
      g.moved = true;
      if (g.mode === 'pan') {
        this.viewport.panByScreenDelta(event.clientX - g.lastX, event.clientY - g.lastY);
      } else if (g.target && g.initial && g.hit) {
        const nextPlan = structuredClone(interactionPlanSignal.value);
        const hit = g.hit;
        const world = this.viewport.screenToWorld(event.clientX, event.clientY);
        const deltaX = world.x - g.startWorld.x;
        const deltaY = -(world.y - g.startWorld.y);
        if (hit.type === 'wall') {
          const nextX = Math.round(g.initial[0] + deltaX);
          const nextY = Math.round(g.initial[1] + deltaY);
          const wall = PlanService.wallIn(nextPlan, hit.wallId);
          if (wall) {
            wall.x = nextX;
            wall.y = nextY;
          }
        } else {
          const radians = (-g.wallRotation * Math.PI) / 180;
          const cos = Math.cos(radians),
            sin = Math.sin(radians);
          const localX = deltaX * cos - deltaY * sin;
          const localY = deltaX * sin + deltaY * cos;
          const nextX = Math.round(g.initial[0] + localX);
          const nextY = Math.round(g.initial[1] + localY);
          const wall = PlanService.wallIn(nextPlan, hit.wallId);
          const object =
            wall?.objects[hit.objectIndex] ||
            wall?.objects.find((candidate) => candidate.name === hit.objectName);
          const outline = wall?.outline.points.map(([x, y]) => ({ x, y })) || [];
          const width = object?.width || 0;
          const height = object?.height || 0;
          if (
            object &&
            GeometryTools.rectangleInsidePolygon(nextX, nextY, width, height, outline)
          ) {
            object.x = nextX;
            object.y = nextY;
          }
        }
        interactionPlanSignal.value = nextPlan;
      }
      g.lastX = event.clientX;
      g.lastY = event.clientY;
    }
    pointerUp(event: PointerEvent) {
      if (event.pointerType === 'touch' && this.touchPoints.has(event.pointerId)) {
        const wasPinching = !!this.pinch;
        this.touchPoints.delete(event.pointerId);
        if (wasPinching) {
          this.pinch = null;
          this.gesture = null;
          editorState.interactionPlan = null;
          this.element.classList.remove('dragging');
          if (this.element.hasPointerCapture(event.pointerId))
            this.element.releasePointerCapture(event.pointerId);
          return;
        }
      }
      const g = this.gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      if (!g.moved) {
        interactionPlanSignal.value = null;
        this.selection.select(g.hit);
      } else if (g.mode === 'drag' && g.hit) {
        const hit = g.hit;
        const wall = PlanService.wallIn(interactionPlanSignal.value, hit.wallId);
        const object =
          hit.type === 'object'
            ? wall?.objects[hit.objectIndex] ||
              wall?.objects.find((candidate) => candidate.name === hit.objectName)
            : null;
        batch(() => {
          if (hit.type === 'wall' && wall) {
            this.planService.moveWall(hit.wallId, wall.x, wall.y);
          } else if (hit.type === 'object' && object) {
            this.planService.moveObject(
              hit.wallId,
              hit.objectIndex,
              object.x,
              object.y,
              hit.objectName,
            );
          }
          editorState.interactionPlan = null;
        });
        this.selection.select(g.hit);
      } else {
        editorState.interactionPlan = null;
      }
      this.finish(event.pointerId);
    }
    pointerCancel(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        this.touchPoints.delete(event.pointerId);
        if (this.pinch && this.pinch.ids.includes(event.pointerId)) {
          this.pinch = null;
          this.gesture = null;
          this.element.classList.remove('dragging');
          return;
        }
      }
      const g = this.gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      interactionPlanSignal.value = null;
      this.finish(event.pointerId);
    }
    finish(pointerId: number) {
      this.gesture = null;
      this.element.classList.remove('dragging');
      if (this.element.hasPointerCapture(pointerId)) this.element.releasePointerCapture(pointerId);
    }
  }

  const hitTester = new HitTester(() => effectivePlan.value);
  const selection = new Selection(editorState, ViewController.drawCanvas);
  const pointerController = new PointerController(
    preview,
    viewport,
    hitTester,
    selection,
    planService,
  );
  preview.addEventListener('dblclick', (event) => {
    if (!(event.target instanceof Element && event.target.closest('.zoom-controls')))
      ViewController.fitView();
  });
  getElement('zoom-in').addEventListener('click', () => {
    const rect = preview.getBoundingClientRect();
    ViewController.zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  getElement('zoom-out').addEventListener('click', () => {
    const rect = preview.getBoundingClientRect();
    ViewController.zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  getElement('zoom-fit').addEventListener('click', ViewController.fitView);
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
    ViewController.drawCanvas();
    threePreview.textureRevision++;
    threePreview.request();
  });
  class CanvasRenderer {
    static paint(planInput: Plan) {
      const plan = planInput;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
      }

      const metrics = viewport.metrics();
      const scale = metrics.scale;
      const box = view.box;
      const flipY = plan.canvas.flipY;
      const patterns = new Map(plan.patterns.map((pattern) => [pattern.name, pattern]));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.save();
      ctx.translate(metrics.left, metrics.top);
      ctx.scale(scale, scale);
      ctx.translate(-box[0], -box[1]);
      ctx.translate(0, flipY);
      ctx.scale(1, -1);

      const polygonPath = (points: Point[]) => {
        const path = new Path2D();
        if (!points.length) return path;
        path.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
        path.closePath();
        return path;
      };
      const visiblePlanCorners = [
        [box[0] + (0 - metrics.left) / scale, flipY - box[1] - (0 - metrics.top) / scale],
        [box[0] + (rect.width - metrics.left) / scale, flipY - box[1] - (0 - metrics.top) / scale],
        [
          box[0] + (rect.width - metrics.left) / scale,
          flipY - box[1] - (rect.height - metrics.top) / scale,
        ],
        [box[0] + (0 - metrics.left) / scale, flipY - box[1] - (rect.height - metrics.top) / scale],
      ];
      const visibleBoundsInWall = (wx: number, wy: number, angle: number) => {
        const c = Math.cos(angle),
          s = Math.sin(angle);
        const local = visiblePlanCorners.map(([x, y]) => {
          const dx = x - wx,
            dy = y - wy;
          return [dx * c + dy * s, -dx * s + dy * c];
        });
        const xs = local.map((point) => point[0]),
          ys = local.map((point) => point[1]);
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        };
      };
      const drawPattern = (path: Path2D, outline: PatternSurface, visibleBounds: Bounds | null) =>
        paintSurfacePattern(ctx, path, outline, patterns, visibleBounds, scale, dpr);

      for (const wall of plan.walls) {
        const angle = (wall.rotation * Math.PI) / 180;
        if (!wall.outline.points.length) continue;
        ctx.save();
        ctx.translate(wall.x, wall.y);
        if (angle) ctx.rotate(angle);
        const path = polygonPath(wall.outline.points);
        drawPattern(path, wall.outline, visibleBoundsInWall(wall.x, wall.y, angle));
        for (const region of wall.patternRegions || []) {
          if (!(region.width > 0 && region.height > 0) || !region.pattern) continue;
          const regionPath = new Path2D();
          regionPath.rect(region.x, region.y, region.width, region.height);
          const regionOutline: PatternSurface = {
            points: [
              [region.x, region.y],
              [region.x + region.width, region.y],
              [region.x + region.width, region.y + region.height],
              [region.x, region.y + region.height],
            ],
            pattern: region.pattern,
            patternX: region.patternX,
            patternY: region.patternY,
            patternRotation: region.patternRotation,
            fill: 'transparent',
          };
          ctx.save();
          ctx.clip(path);
          drawPattern(regionPath, regionOutline, visibleBoundsInWall(wall.x, wall.y, angle));
          ctx.restore();
        }
        if (wall.outline.stroke && wall.outline.stroke !== 'none') {
          ctx.strokeStyle = wall.outline.stroke;
          ctx.lineWidth = wall.outline.strokeWidth || 1;
          ctx.stroke(path);
        }
        for (const object of wall.objects) {
          if (![object.x, object.y, object.width, object.height].every(Number.isFinite)) continue;
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = object.fill || 'red';
          ctx.fillRect(object.x, object.y, object.width, object.height);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      ctx.restore();

      const localToScreen = (wall: Wall, x: number, y: number) => {
        const angle = (wall.rotation * Math.PI) / 180;
        const cos = Math.cos(angle),
          sin = Math.sin(angle);
        const planX = wall.x + x * cos - y * sin;
        const planY = wall.y + x * sin + y * cos;
        return {
          x: metrics.left + (planX - box[0]) * scale,
          y: metrics.top + (flipY - planY - box[1]) * scale,
        };
      };
      const paintText = (text: string, x: number, y: number, fontPx: number, weight: number) => {
        ctx.save();
        ctx.font = `${weight} ${fontPx}px Inter, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'white';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = '#192625';
        ctx.fillText(text, x, y);
        ctx.restore();
      };
      if (!plan.walls.length) {
        ctx.save();
        ctx.font = '600 16px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(
          'Upload your plan or load the template',
          metrics.left + metrics.width / 2,
          metrics.top + metrics.height / 2,
        );
        ctx.restore();
      }

      for (const wall of plan.walls) {
        wall.objects.forEach((object, index) => {
          const center = localToScreen(
            wall,
            object.x + object.width / 2,
            object.y + object.height / 2,
          );
          if (showLabels.checked)
            paintText(
              object.name || 'element',
              center.x,
              center.y - (showDimensions.checked ? 7 : 0),
              16,
              700,
            );
          if (showDimensions.checked)
            paintText(
              `${number(object.width)} × ${number(object.height)} mm`,
              center.x,
              center.y + (showLabels.checked ? 8 : 0),
              10,
              600,
            );
          const selected =
            wall.name === editorState.selectedWallId &&
            editorState.selectedObjectName &&
            ((editorState.selectedObjectIndex !== null &&
              index === editorState.selectedObjectIndex) ||
              (editorState.selectedObjectIndex === null &&
                object.name === editorState.selectedObjectName));
          if (selected) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#192625';
            ctx.fill();
          }
        });
        if (
          wall.name === editorState.selectedWallId &&
          !editorState.selectedObjectName &&
          wall.outline.points.length
        ) {
          const xs = wall.outline.points.map((point) => point[0]);
          const ys = wall.outline.points.map((point) => point[1]);
          const center = localToScreen(
            wall,
            (Math.min(...xs) + Math.max(...xs)) / 2,
            (Math.min(...ys) + Math.max(...ys)) / 2,
          );
          ctx.beginPath();
          ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#192625';
          ctx.fill();
        }
      }
    }

    render() {
      ViewController.drawCanvas();
      zoomLevel.textContent = Math.round(view.scale * 100) + '%';
    }
  }

  class YamlSourceEditor {
    syncFromPlan(plan = effectivePlan.value) {
      if (yamlEditingSignal.value) return;
      source.value = YamlCodec.encode(plan);
      SourcePresentation.updateHighlight();
    }

    apply() {
      try {
        const plan = YamlCodec.decode(source.value);
        app.replaceDocument(plan, {
          change: { type: 'source-apply' },
          establishResetPoint: false,
          fitView: true,
        });
        yamlEditingSignal.value = false;
        sourceStatus.textContent = 'YAML source applied to preview and controls.';
        sourceStatus.classList.remove('error');
      } catch (error) {
        sourceStatus.textContent =
          'Invalid YAML source: ' + (error instanceof Error ? error.message : String(error));
        sourceStatus.classList.add('error');
      }
    }
  }

  class EditorApp {
    constructor(
      public planService: PlanService,
      public canvasRenderer: CanvasRenderer,
      public sourceEditor: YamlSourceEditor,
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
        editorState.interactionPlan = null;
        yamlEditingSignal.value = false;
      });
      if (establishResetPoint) {
        resetSnapshot = this.planService.snapshot();
        establishWallResetSnapshots();
      }
      selection.clear();
      threePreview.needsFit = true;
      const canvas = this.planService.data.canvas;
      baseBox =
        canvas.width > 0 && canvas.height > 0
          ? [canvas.x, canvas.y, canvas.width, canvas.height]
          : [...EMPTY_VIEW_BOX];
      view.box = [...baseBox];
      view.scale = 1;
      TitleController.update();
      if (fitView) ViewController.fitView();
    }

    loadUploadedPlan(file: File | undefined) {
      if (!file) return;
      ActionConsole.log(`Loading “${file.name}”…`);
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
          let plan = isYaml ? YamlCodec.decode(text) : SvgCodec.decode(text);
          const fileBase = file.name.replace(/\.(?:svg|ya?ml)$/i, '').trim();
          if (!plan.name || plan.name === 'Tiling plan') plan.name = fileBase || 'Tiling plan';
          this.replaceDocument(plan, {
            change: { type: 'upload', kind: isYaml ? 'YAML' : 'SVG' },
            establishResetPoint: true,
            fitView: true,
          });
          sourceStatus.textContent = `Uploaded ${isYaml ? 'YAML' : 'SVG'} loaded as YAML source.`;
          sourceStatus.classList.remove('error');
          UiFeedback.message(`${file.name} loaded.`);
          ActionConsole.log(`Loaded “${file.name}” (${isYaml ? 'YAML' : 'SVG'}).`);
        } catch (error) {
          UiFeedback.message(
            'Invalid plan: ' + (error instanceof Error ? error.message : String(error)),
          );
          ActionConsole.log(
            `Load failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          uploadPlanInput.value = '';
        }
      };
      reader.readAsText(file);
    }
  }

  const threePreview = new ThreePreview(
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
  const canvasRenderer = new CanvasRenderer();
  const yamlSourceEditor = new YamlSourceEditor();
  const app = new EditorApp(planService, canvasRenderer, yamlSourceEditor);
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
      const plan = YamlCodec.decode(baseModelYaml);
      app.replaceDocument(plan, {
        change: { type: 'template' },
        establishResetPoint: true,
        fitView: true,
      });
      sourceStatus.textContent = 'Template loaded.';
      sourceStatus.classList.remove('error');
      UiFeedback.message('Template loaded.');
      ActionConsole.log('Template loaded.');
    } catch (error) {
      UiFeedback.message(
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
    else UiFeedback.message('Choose an SVG, YAML, or YML plan file.');
  });

  source.addEventListener('input', () => {
    yamlEditingSignal.value = true;
    SourcePresentation.updateHighlight();
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
      const bounds = GeometryTools.planBounds(planService.data);
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
      ViewController.fitView();
      UiFeedback.message(`${id} added.`);
    } catch (error) {
      UiFeedback.message(
        'Could not add wall: ' +
          (error && (error instanceof Error ? error.message : String(error))
            ? error instanceof Error
              ? error.message
              : String(error)
            : String(error)),
      );
      ViewController.drawCanvas();
    }
  };
  addWallButton.addEventListener('click', addWallFromControls);

  const planTitle = getElement('plan-title');
  const editPlanTitle = getElement('edit-plan-title');
  editPlanTitle.addEventListener('click', TitleController.beginEdit);
  planService.onEvent((change) => {
    if (change && change.type === 'name-change') TitleController.update();
  });
  TitleController.update();

  initializeDocumentation();

  getElement('reset').addEventListener('click', () => {
    app.replaceDocument(resetSnapshot, {
      change: { type: 'reset' },
      establishResetPoint: false,
      fitView: true,
    });
    sourceStatus.textContent = 'Plan reset.';
    sourceStatus.classList.remove('error');
    UiFeedback.message('Plan reset.');
  });
  getElement('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(source.value);
      UiFeedback.message('YAML source copied.');
    } catch {
      UiFeedback.message('Clipboard unavailable. Select the source and copy it manually.');
    }
  });
  getElement('download-yaml').addEventListener('click', () => {
    const blob = new Blob([YamlCodec.encode(planService.snapshot())], {
      type: 'text/yaml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${TitleController.downloadBaseName()}.yaml`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UiFeedback.message('YAML downloaded.');
  });
  getElement('download').addEventListener('click', () => {
    const blob = new Blob([SvgCodec.encode(planService.snapshot())], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${TitleController.downloadBaseName()}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UiFeedback.message('SVG downloaded.');
  });
  getElement('download-png').addEventListener('click', () => {
    ViewController.drawCanvasNow();
    canvas.toBlob((blob) => {
      if (!blob) {
        UiFeedback.message('Could not create PNG.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${TitleController.downloadBaseName()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      UiFeedback.message('PNG downloaded.');
    }, 'image/png');
  });
  publishPersistentPlan();
  ViewController.updateView();
}

init();
