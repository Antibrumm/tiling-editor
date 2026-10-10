import type { Plan, Position, SurfaceSelectionHit } from '../model/types';

import { PlanService } from '../model/plan-service';
import { PlanNormalizer } from '../model/plan-normalizer';

import { GeometryTools } from '../model/geometry';
import { HitTester } from '../model/hit-tester';

import { batch } from '@preact/signals';
import type { Signal } from '@preact/signals';
import type { Gesture } from '../ui/types';
import { EditorState } from '../ui/editor-state';

import { CanvasViewport } from '../ui/canvas-viewport';

import { Selection } from '../ui/selection';

interface PointerControllerDependencies {
  editorState: EditorState;
  planSignal: Signal<Plan>;
  normalizer: PlanNormalizer;
  interactionPlanSignal: Signal<Plan | null>;
  geometryTools: GeometryTools;
}
/**
 * Handles mouse, pen, and touch gestures on the injected preview element.
 * Uses the viewport and hit tester to distinguish selection, dragging, panning, and pinch zoom.
 * Drag movement updates a transient plan, constrains objects to their wall polygon, and
 * commits the final position through PlanService on release. Construction installs listeners.
 */
export class PointerController {
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
    private dependencies: PointerControllerDependencies,
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
  resolveTarget(hit: SurfaceSelectionHit | null) {
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
        this.dependencies.editorState.interactionPlan = null;
        this.element.classList.add('dragging');
        event.preventDefault();
        return;
      }
    }
    if (event.button !== 0) return;
    const world = this.viewport.screenToWorld(event.clientX, event.clientY);
    const hit = this.hitTester.hitTest(world);
    const target = this.resolveTarget(hit);
    const dragPlan = hit && target ? structuredClone(this.dependencies.planSignal.value) : null;
    const dragWall = hit ? this.dependencies.normalizer.wallIn(dragPlan, hit.wallId) : null;
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
    if (dragPlan) this.dependencies.interactionPlanSignal.value = dragPlan;
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
      const nextPlan = structuredClone(this.dependencies.interactionPlanSignal.value);
      const hit = g.hit;
      const world = this.viewport.screenToWorld(event.clientX, event.clientY);
      const deltaX = world.x - g.startWorld.x;
      const deltaY = -(world.y - g.startWorld.y);
      if (hit.type === 'wall') {
        const nextX = Math.round(g.initial[0] + deltaX);
        const nextY = Math.round(g.initial[1] + deltaY);
        const wall = this.dependencies.normalizer.wallIn(nextPlan, hit.wallId);
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
        const wall = this.dependencies.normalizer.wallIn(nextPlan, hit.wallId);
        const object =
          wall?.objects[hit.objectIndex] ||
          wall?.objects.find((candidate) => candidate.name === hit.objectName);
        const outline = wall?.outline.points.map(([x, y]) => ({ x, y })) || [];
        const width = object?.width || 0;
        const height = object?.height || 0;
        if (
          object &&
          this.dependencies.geometryTools.rectangleInsidePolygon(
            nextX,
            nextY,
            width,
            height,
            outline,
          )
        ) {
          object.x = nextX;
          object.y = nextY;
        }
      }
      this.dependencies.interactionPlanSignal.value = nextPlan;
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
        this.dependencies.editorState.interactionPlan = null;
        this.element.classList.remove('dragging');
        if (this.element.hasPointerCapture(event.pointerId))
          this.element.releasePointerCapture(event.pointerId);
        return;
      }
    }
    const g = this.gesture;
    if (!g || event.pointerId !== g.pointerId) return;
    if (!g.moved) {
      this.dependencies.interactionPlanSignal.value = null;
      this.selection.select(g.hit);
    } else if (g.mode === 'drag' && g.hit) {
      const hit = g.hit;
      const wall = this.dependencies.normalizer.wallIn(
        this.dependencies.interactionPlanSignal.value,
        hit.wallId,
      );
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
        this.dependencies.editorState.interactionPlan = null;
      });
      this.selection.select(g.hit);
    } else {
      this.dependencies.editorState.interactionPlan = null;
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
    this.dependencies.interactionPlanSignal.value = null;
    this.finish(event.pointerId);
  }
  finish(pointerId: number) {
    this.gesture = null;
    this.element.classList.remove('dragging');
    if (this.element.hasPointerCapture(pointerId)) this.element.releasePointerCapture(pointerId);
  }
}
