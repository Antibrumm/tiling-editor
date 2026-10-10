import type { ViewState } from '../ui/types';

/**
 * Converts browser client coordinates into the fitted 2D canvas view.
 * Mutates the injected view box for bounded zoom and panning, then calls onChange.
 * Returned world coordinates precede the plan's flipY conversion; HitTester applies
 * that conversion when resolving a selection.
 */
export class CanvasViewport {
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
