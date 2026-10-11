import { h, render } from 'preact';
import { signal } from '@preact/signals';
import type { Plan } from '../model/types';
import type { PatternPainter } from '../rendering/pattern-painter';
import { ThreePreview } from '../rendering/three-preview';
import { CanvasRenderer } from '../rendering/canvas-renderer';
import { GeometryTools } from '../model/geometry';
import { CanvasViewport } from './canvas-viewport';
import { EditorState } from './editor-state';
import { TileReport } from './components/tile-report';
import { get2DContext } from '../dom';
import type { ViewState } from './types';

interface PrintDependencies {
  plan(): Plan;
  painter: PatternPainter;
  threePreview: ThreePreview;
  button: HTMLButtonElement;
  showLabels: HTMLInputElement;
  showDimensions: HTMLInputElement;
  showTileCounts: HTMLInputElement;
  message(text: string): void;
}

/** Prepares an immutable report and complete preview images before opening browser printing. */
export class PrintController {
  private geometry = new GeometryTools();
  private document: HTMLElement | null = null;
  constructor(private dependencies: PrintDependencies) {
    dependencies.button.addEventListener('click', () => {
      void this.print();
    });
    window.addEventListener('afterprint', () => this.clear());
  }

  public async print() {
    if (this.dependencies.button.disabled) return;
    this.dependencies.button.disabled = true;
    this.dependencies.message('Preparing print document…');
    try {
      const plan = structuredClone(this.dependencies.plan());
      await this.dependencies.painter.prepare(plan.patterns);
      const drawing = this.captureDrawing(plan);
      let preview: string | null = null;
      try {
        preview = await this.dependencies.threePreview.capture(plan);
      } catch {
        /* The report remains printable without WebGL. */
      }
      this.clear();
      const root = document.createElement('main');
      root.id = 'print-document';
      document.body.append(root);
      document.body.classList.add('printing-result');
      this.document = root;
      render(
        h(
          'div',
          null,
          h(
            'section',
            { class: 'print-report' },
            h('h1', null, plan.name),
            h('h2', null, 'Tile report'),
            h(TileReport, { effectivePlan: signal(plan), showTitle: false }),
          ),
          h(
            'section',
            { class: 'print-preview' },
            h('h2', null, '2D view'),
            h('img', { src: drawing, alt: 'Complete 2D tiling plan' }),
          ),
          h(
            'section',
            { class: 'print-preview' },
            h('h2', null, '3D preview'),
            preview
              ? h('img', { src: preview, alt: '3D room preview' })
              : h('p', null, '3D preview is unavailable in this browser.'),
          ),
        ),
        root,
      );
      await Promise.all([...root.querySelectorAll('img')].map((image) => image.decode?.()));
      await document.fonts?.ready;
      window.print();
      this.dependencies.message('Print document ready.');
    } catch (error) {
      this.clear();
      this.dependencies.message(
        `Could not prepare print document: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.dependencies.button.disabled = false;
    }
  }

  private captureDrawing(plan: Plan): string {
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:1000px;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:1600px;height:1000px;';
    stage.append(canvas);
    document.body.append(stage);
    try {
      const bounds = this.geometry.planBounds(plan);
      const pad = bounds
        ? Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.05
        : 0;
      const view: ViewState = {
        scale: 1,
        box: bounds
          ? [
              bounds.minX - pad,
              plan.canvas.flipY - bounds.maxY - pad,
              bounds.maxX - bounds.minX + pad * 2,
              bounds.maxY - bounds.minY + pad * 2,
            ]
          : [0, 0, 3000, 3000],
      };
      const renderer = new CanvasRenderer({
        ...this.dependencies,
        stage,
        canvas,
        ctx: get2DContext(canvas),
        view,
        viewport: new CanvasViewport(canvas, view, () => {}),
        editorState: new EditorState(),
        paintSurfacePattern: this.dependencies.painter,
      });
      renderer.paint(plan);
      return canvas.toDataURL('image/png');
    } finally {
      stage.remove();
    }
  }

  private clear() {
    if (!this.document) return;
    render(null, this.document);
    this.document.remove();
    document.body.classList.remove('printing-result');
    this.document = null;
  }
}
