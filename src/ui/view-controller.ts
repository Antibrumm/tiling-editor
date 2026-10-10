import { getElement } from '../dom';
import type { Plan } from '../model/types';

import { ThreePreview } from '../rendering/three-preview';

import { GeometryTools } from '../model/geometry';

import type { ReadonlySignal } from '@preact/signals';
import type { ViewBox, ViewState } from '../ui/types';

import { CanvasViewport } from '../ui/canvas-viewport';
import { RenderScheduler } from '../rendering/render-scheduler';

import { CanvasRenderer } from '../rendering/canvas-renderer';

interface ViewControllerDependencies {
  splitToggle: HTMLInputElement;
  sourceToggle: HTMLInputElement;
  threeToggle: HTMLInputElement;
  viewPanels: HTMLElement;
  preview: HTMLElement;
  threeContainer: HTMLElement;
  threePreview: ThreePreview;
  sourceView: HTMLElement;
  zoomLevel: HTMLOutputElement;
  view: ViewState;

  canvasRenderer: CanvasRenderer;
  effectivePlan: ReadonlySignal<Plan>;
  renderScheduler: RenderScheduler;
  viewport: CanvasViewport;
  geometryTools: GeometryTools;
  baseBox: ViewBox;
}
/**
 * Coordinates preview, YAML source, split view, and 3D visibility.
 * Uses injected DOM controls, plan state, viewport, render scheduler, and renderers
 * to update zoom, fit geometry, and request redraws. Methods are bound so DOM listeners
 * and animation callbacks retain the controller instance.
 */
export class ViewController {
  constructor(private dependencies: ViewControllerDependencies) {
    this.updateViewMode = this.updateViewMode.bind(this);
    this.updateView = this.updateView.bind(this);
    this.drawCanvasNow = this.drawCanvasNow.bind(this);
    this.drawCanvas = this.drawCanvas.bind(this);
    this.zoomAt = this.zoomAt.bind(this);
    this.fittedDrawingBox = this.fittedDrawingBox.bind(this);
    this.fitView = this.fitView.bind(this);
    this.drawingBounds = this.drawingBounds.bind(this);
  }

  public updateViewMode() {
    const split = this.dependencies.splitToggle.checked,
      showSource = this.dependencies.sourceToggle.checked,
      showThree = this.dependencies.threeToggle.checked;
    this.dependencies.sourceToggle.disabled = split;
    this.dependencies.splitToggle.disabled = showSource;
    this.dependencies.viewPanels.classList.toggle('side-by-side', split);
    this.dependencies.preview.hidden = showThree || (!split && showSource);
    this.dependencies.threeContainer.hidden = !showThree || (!split && showSource);
    if (!this.dependencies.threeContainer.hidden) this.dependencies.threePreview.activate();
    this.dependencies.sourceView.hidden = !split && !showSource;
    getElement('view-title').textContent = split
      ? (showThree ? '3D preview' : 'Preview') + ' + YAML source'
      : showSource
        ? 'YAML source'
        : showThree
          ? '3D preview'
          : 'Preview';
    requestAnimationFrame(this.drawCanvas);
  }
  public updateView() {
    this.dependencies.zoomLevel.textContent = Math.round(this.dependencies.view.scale * 100) + '%';
    this.drawCanvas();
  }
  public drawCanvasNow() {
    this.dependencies.canvasRenderer.paint(this.dependencies.effectivePlan.value);
  }
  public drawCanvas() {
    this.dependencies.renderScheduler.request();
  }
  public zoomAt(factor: number, clientX: number, clientY: number) {
    this.dependencies.viewport.zoomAt(clientX, clientY, factor);
  }
  public fittedDrawingBox(paddingRatio = 0.04): ViewBox | null {
    const plan = this.dependencies.effectivePlan.value;
    const bounds = this.dependencies.geometryTools.planBounds(plan);
    if (!bounds) return null;
    const minY = plan.canvas.flipY - bounds.maxY,
      maxY = plan.canvas.flipY - bounds.minY;
    const width = bounds.maxX - bounds.minX,
      height = maxY - minY;
    if (!(width > 0 && height > 0)) return null;
    const pad = Math.max(width, height) * paddingRatio;
    return [bounds.minX - pad, minY - pad, width + pad * 2, height + pad * 2];
  }
  public fitView() {
    this.dependencies.view.scale = 1;
    this.dependencies.view.box = this.fittedDrawingBox() || [...this.dependencies.baseBox];
    this.updateView();
  }
  public drawingBounds() {
    const bounds = this.dependencies.geometryTools.planBounds(
      this.dependencies.effectivePlan.value,
    );
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
