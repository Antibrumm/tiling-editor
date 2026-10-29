import type { Plan } from '../model/types';
import type { PatternPainter } from '../rendering/pattern-painter';
import { ThreePreview } from '../rendering/three-preview';
import { CanvasRenderer } from '../rendering/canvas-renderer';
import { GeometryTools } from '../model/geometry';
import { CanvasViewport } from './canvas-viewport';
import { EditorState } from './editor-state';
import { get2DContext } from '../dom';
import type { ViewState } from './types';

interface PrintDependencies {
  plan(): Plan;
  painter: PatternPainter;
  threePreview: ThreePreview;
  button: HTMLButtonElement;
  pdfButton: HTMLButtonElement;
  downloadBaseName(): string;
  showLabels: HTMLInputElement;
  showDimensions: HTMLInputElement;
  showTileCounts: HTMLInputElement;
  message(text: string): void;
}

/** Prepares an immutable report and complete preview images for PDF downloads and printing. */
export class PrintController {
  private geometry = new GeometryTools();
  constructor(private dependencies: PrintDependencies) {
    dependencies.button.addEventListener('click', () => {
      void this.print();
    });
    dependencies.pdfButton.addEventListener('click', () => {
      void this.downloadPdf();
    });
  }

  public async print() {
    if (this.dependencies.button.disabled) return;
    // Reserve the PDF tab during the click so async rendering does not trigger popup blocking.
    const viewer = window.open('about:blank', '_blank');
    if (!viewer) {
      this.dependencies.message('Could not open PDF print preview. Allow popups and try again.');
      return;
    }
    viewer.opener = null;
    this.setBusy(true);
    this.dependencies.message('Preparing PDF for printing...');
    let url: string | null = null;
    try {
      const blob = await this.preparePdf();
      if (viewer.closed) return;
      url = URL.createObjectURL(blob);
      viewer.location.replace(url);
      const pdfUrl = url;
      const timer = window.setInterval(() => {
        if (!viewer.closed) return;
        URL.revokeObjectURL(pdfUrl);
        window.clearInterval(timer);
      }, 1000);
      this.dependencies.message('PDF ready. Use the PDF viewer Print button to print it.');
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      viewer.close();
      this.dependencies.message(
        `Could not prepare PDF for printing: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.setBusy(false);
    }
  }

  public async downloadPdf() {
    if (this.dependencies.pdfButton.disabled) return;
    this.setBusy(true);
    this.dependencies.message('Preparing PDF…');
    try {
      const url = URL.createObjectURL(await this.preparePdf());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.dependencies.downloadBaseName()}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.dependencies.message('PDF downloaded.');
    } catch (error) {
      this.dependencies.message(
        `Could not create PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.setBusy(false);
    }
  }

  private async preparePdf(): Promise<Blob> {
    const { plan, drawing, surfaceDrawings, preview } = await this.prepare();
    const { PdfReport } = await import('../codecs/pdf-report');
    const buffer = new PdfReport().generate(plan, drawing, preview, surfaceDrawings);
    return new Blob([buffer], { type: 'application/pdf' });
  }

  private setBusy(value: boolean) {
    this.dependencies.button.disabled = this.dependencies.pdfButton.disabled = value;
  }

  private async prepare() {
    const plan = structuredClone(this.dependencies.plan());
    await this.dependencies.painter.prepare(plan.patterns);
    const drawing = this.captureDrawing(plan);
    const surfaceDrawings = plan.walls.map((wall) => this.captureDrawing(plan, wall));
    let preview: string | null = null;
    try {
      preview = await this.dependencies.threePreview.capture(plan);
    } catch {
      /* Export the report even if WebGL is unavailable. */
    }
    return { plan, drawing, surfaceDrawings, preview };
  }

  private captureDrawing(plan: Plan, surface?: Plan['walls'][number]): string {
    const drawingPlan = surface
      ? { ...plan, walls: [{ ...surface, rotation: 0 }] }
      : plan;
    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:1000px;';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:1600px;height:1000px;';
    stage.append(canvas);
    document.body.append(stage);
    try {
      const bounds = this.geometry.planBounds(drawingPlan);
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
      renderer.paint(drawingPlan);
      return canvas.toDataURL('image/png');
    } finally {
      stage.remove();
    }
  }
}
