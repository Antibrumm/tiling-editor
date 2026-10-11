import type { Plan, Wall, Pattern, Point, Bounds } from '../model/types';

import type { PatternSurface } from '../rendering/pattern-painter';

import { number } from '../codecs/format';

import type { ViewState } from '../ui/types';
import { EditorState } from '../ui/editor-state';

import { CanvasViewport } from '../ui/canvas-viewport';
import { TileCounter } from '../model/tile-counter';

interface CanvasRendererDependencies {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  viewport: CanvasViewport;
  view: ViewState;
  ctx: CanvasRenderingContext2D;
  paintSurfacePattern: (
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    outline: PatternSurface,
    patterns: Map<string, Pattern>,
    visibleBounds: Bounds | null,
    scale: number,
    dpr: number,
  ) => void;
  showLabels: HTMLInputElement;
  showDimensions: HTMLInputElement;
  showTileCounts: HTMLInputElement;
  editorState: EditorState;
}
/**
 * Paints a supplied plan into the 2D canvas using injected viewport and UI dependencies.
 * Handles pixel density, flipped plan coordinates, clipped tile patterns, objects,
 * labels, dimensions, and selection markers. Uses the shared pattern painter;
 * painting changes canvas output without mutating persistent plan data.
 */
export class CanvasRenderer {
  private tileCounter = new TileCounter();
  constructor(private dependencies: CanvasRendererDependencies) {
    this.paint = this.paint.bind(this);
  }

  public paint(planInput: Plan) {
    const plan = planInput;
    const rect = this.dependencies.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (
      this.dependencies.canvas.width !== pixelWidth ||
      this.dependencies.canvas.height !== pixelHeight
    ) {
      this.dependencies.canvas.width = pixelWidth;
      this.dependencies.canvas.height = pixelHeight;
      this.dependencies.canvas.style.width = rect.width + 'px';
      this.dependencies.canvas.style.height = rect.height + 'px';
    }

    const metrics = this.dependencies.viewport.metrics();
    const scale = metrics.scale;
    const box = this.dependencies.view.box;
    const flipY = plan.canvas.flipY;
    const patterns = new Map(plan.patterns.map((pattern) => [pattern.name, pattern]));

    this.dependencies.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dependencies.ctx.imageSmoothingEnabled = false;
    this.dependencies.ctx.clearRect(0, 0, rect.width, rect.height);
    this.dependencies.ctx.save();
    this.dependencies.ctx.translate(metrics.left, metrics.top);
    this.dependencies.ctx.scale(scale, scale);
    this.dependencies.ctx.translate(-box[0], -box[1]);
    this.dependencies.ctx.translate(0, flipY);
    this.dependencies.ctx.scale(1, -1);

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
      this.dependencies.paintSurfacePattern(
        this.dependencies.ctx,
        path,
        outline,
        patterns,
        visibleBounds,
        scale,
        dpr,
      );

    for (const wall of plan.walls) {
      const angle = (wall.rotation * Math.PI) / 180;
      if (!wall.outline.points.length) continue;
      this.dependencies.ctx.save();
      this.dependencies.ctx.translate(wall.x, wall.y);
      if (angle) this.dependencies.ctx.rotate(angle);
      const path = polygonPath(wall.outline.points);
      drawPattern(path, wall.outline, visibleBoundsInWall(wall.x, wall.y, angle));
      for (const region of wall.patternRegions || []) {
        if (!(region.width > 0 && region.height > 0) || !region.pattern) continue;
        const regionPath = new Path2D();
        regionPath.rect(region.x, region.y, region.width, region.height);
        const regionOutline: PatternSurface = {
          patternInset: wall.outline.patternInset,
          perimeterPoints: wall.outline.points,
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
        this.dependencies.ctx.save();
        this.dependencies.ctx.clip(path);
        drawPattern(regionPath, regionOutline, visibleBoundsInWall(wall.x, wall.y, angle));
        this.dependencies.ctx.restore();
      }
      if (wall.outline.stroke && wall.outline.stroke !== 'none') {
        this.dependencies.ctx.strokeStyle = wall.outline.stroke;
        this.dependencies.ctx.lineWidth = wall.outline.strokeWidth || 1;
        this.dependencies.ctx.stroke(path);
      }
      for (const object of wall.objects) {
        if (![object.x, object.y, object.width, object.height].every(Number.isFinite)) continue;
        this.dependencies.ctx.globalAlpha = 0.2;
        this.dependencies.ctx.fillStyle = object.fill || 'red';
        this.dependencies.ctx.fillRect(object.x, object.y, object.width, object.height);
        this.dependencies.ctx.globalAlpha = 1;
      }
      this.dependencies.ctx.restore();
    }
    this.dependencies.ctx.restore();

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
      this.dependencies.ctx.save();
      this.dependencies.ctx.font = `${weight} ${fontPx}px Inter, Arial, sans-serif`;
      this.dependencies.ctx.textAlign = 'center';
      this.dependencies.ctx.textBaseline = 'middle';
      this.dependencies.ctx.lineJoin = 'round';
      this.dependencies.ctx.lineWidth = 4;
      this.dependencies.ctx.strokeStyle = 'white';
      this.dependencies.ctx.strokeText(text, x, y);
      this.dependencies.ctx.fillStyle = '#192625';
      this.dependencies.ctx.fillText(text, x, y);
      this.dependencies.ctx.restore();
    };
    if (!plan.walls.length) {
      this.dependencies.ctx.save();
      this.dependencies.ctx.font = '600 16px Inter, Arial, sans-serif';
      this.dependencies.ctx.textAlign = 'center';
      this.dependencies.ctx.textBaseline = 'middle';
      this.dependencies.ctx.fillStyle = '#6b7280';
      this.dependencies.ctx.fillText(
        'Upload your plan or load the template',
        metrics.left + metrics.width / 2,
        metrics.top + metrics.height / 2,
      );
      this.dependencies.ctx.restore();
    }

    for (const wall of plan.walls) {
      if (this.dependencies.showTileCounts.checked && wall.outline.points.length) {
        const xs = wall.outline.points.map(([x]) => x);
        const ys = wall.outline.points.map(([, y]) => y);
        const anchor = localToScreen(
          wall,
          (Math.min(...xs) + Math.max(...xs)) / 2,
          Math.max(...ys),
        );
        const count = this.tileCounter.count(wall, plan.patterns);
        paintText(
          `${wall.name}: ${count ? `${count.total.toLocaleString()} tiles` : 'tile count unavailable (plan too large)'}`,
          anchor.x,
          anchor.y + 18,
          12,
          700,
        );
        if (count && count.patterns.length > 1) {
          count.patterns.forEach((pattern, index) => {
            paintText(
              `${pattern.name}: ${pattern.count.toLocaleString()}`,
              anchor.x,
              anchor.y + 34 + index * 14,
              10,
              600,
            );
          });
        }
      }
      wall.objects.forEach((object, index) => {
        const center = localToScreen(
          wall,
          object.x + object.width / 2,
          object.y + object.height / 2,
        );
        if (this.dependencies.showLabels.checked)
          paintText(
            object.name || 'element',
            center.x,
            center.y - (this.dependencies.showDimensions.checked ? 7 : 0),
            16,
            700,
          );
        if (this.dependencies.showDimensions.checked)
          paintText(
            `${number(object.width)} × ${number(object.height)} mm`,
            center.x,
            center.y + (this.dependencies.showLabels.checked ? 8 : 0),
            10,
            600,
          );
        const selected =
          wall.name === this.dependencies.editorState.selectedWallId &&
          this.dependencies.editorState.selectedObjectName &&
          ((this.dependencies.editorState.selectedObjectIndex !== null &&
            index === this.dependencies.editorState.selectedObjectIndex) ||
            (this.dependencies.editorState.selectedObjectIndex === null &&
              object.name === this.dependencies.editorState.selectedObjectName));
        if (selected) {
          this.dependencies.ctx.beginPath();
          this.dependencies.ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
          this.dependencies.ctx.fillStyle = '#192625';
          this.dependencies.ctx.fill();
        }
      });
      if (
        wall.name === this.dependencies.editorState.selectedWallId &&
        !this.dependencies.editorState.selectedObjectName &&
        wall.outline.points.length
      ) {
        const xs = wall.outline.points.map((point) => point[0]);
        const ys = wall.outline.points.map((point) => point[1]);
        const center = localToScreen(
          wall,
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        );
        this.dependencies.ctx.beginPath();
        this.dependencies.ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
        this.dependencies.ctx.fillStyle = '#192625';
        this.dependencies.ctx.fill();
      }
    }
  }
}
