import type { Pattern, Outline, Bounds } from '../model/types';
import { textureRotationQuarter } from './texture-rotation';
export type PatternSurface = Pick<
  Outline,
  'points' | 'pattern' | 'patternX' | 'patternY' | 'patternRotation'
> & { fill?: string };
export function createPatternPainter(onTextureLoad: () => void) {
  const tileTextureCache = new Map<string, HTMLImageElement>();
  const tileTextureImage = (source: string) => {
    if (!source) return null;
    if (tileTextureCache.has(source)) return tileTextureCache.get(source)!;
    const image = new Image();
    tileTextureCache.set(source, image);
    image.onload = onTextureLoad;
    image.onerror = onTextureLoad;
    image.src = source;
    return image;
  };

  function paintSurfacePattern(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    outline: PatternSurface,
    patterns: Map<string, Pattern>,
    visibleBounds: Bounds | null,
    scale: number,
    dpr: number,
  ) {
    const definition = outline.pattern ? patterns.get(outline.pattern) : null;
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = definition?.borderColor || outline.fill || 'white';
    ctx.fill(path);
    if (
      definition &&
      definition.tileWidth + definition.borderSize > 0 &&
      definition.tileHeight + definition.borderSize > 0
    ) {
      const patternWidth = definition.tileWidth + definition.borderSize;
      const patternHeight = definition.tileHeight + definition.borderSize;
      const bounds = outline.points;
      if (bounds.length) {
        const xs = bounds.map((point) => point[0]),
          ys = bounds.map((point) => point[1]);
        const wallMinX = Math.min(...xs),
          wallMaxX = Math.max(...xs),
          wallMinY = Math.min(...ys),
          wallMaxY = Math.max(...ys);
        const minX = Math.max(wallMinX, visibleBounds?.minX ?? wallMinX);
        const maxX = Math.min(wallMaxX, visibleBounds?.maxX ?? wallMaxX);
        const minY = Math.max(wallMinY, visibleBounds?.minY ?? wallMinY);
        const maxY = Math.min(wallMaxY, visibleBounds?.maxY ?? wallMaxY);
        if (minX <= maxX && minY <= maxY) {
          const offsetX = outline.patternX || 0,
            offsetY = outline.patternY || 0;
          const angle = ((outline.patternRotation || 0) * Math.PI) / 180;
          const cosine = Math.cos(angle),
            sine = Math.sin(angle);
          const corners = [
            [minX, minY],
            [minX, maxY],
            [maxX, minY],
            [maxX, maxY],
          ].map(([x, y]) => {
            const dx = x - offsetX,
              dy = y - offsetY;
            return [dx * cosine + dy * sine, -dx * sine + dy * cosine];
          });
          const gridMinX = Math.min(...corners.map((p) => p[0])),
            gridMaxX = Math.max(...corners.map((p) => p[0]));
          const gridMinY = Math.min(...corners.map((p) => p[1])),
            gridMaxY = Math.max(...corners.map((p) => p[1]));
          ctx.translate(offsetX, offsetY);
          if (angle) ctx.rotate(angle);
          ctx.fillStyle = definition.tileColor || '#ffffff';
          const seamOverlap = definition.borderSize === 0 ? 1 / (scale * dpr) : 0;
          let x = Math.floor(gridMinX / patternWidth) * patternWidth;
          for (; x <= gridMaxX + patternWidth; x += patternWidth) {
            let y = Math.floor(gridMinY / patternHeight) * patternHeight;
            for (; y <= gridMaxY + patternHeight; y += patternHeight) {
              const texture = tileTextureImage(definition.tileTexture);
              if (texture?.complete && texture.naturalWidth > 0) {
                const column = Math.round(x / patternWidth);
                const row = Math.round(y / patternHeight);
                const rotation = definition.randomTextureRotation
                  ? textureRotationQuarter(column, row)
                  : 0;
                const quarter = rotation % 2;
                const drawWidth =
                  (quarter ? definition.tileHeight : definition.tileWidth) + seamOverlap;
                const drawHeight =
                  (quarter ? definition.tileWidth : definition.tileHeight) + seamOverlap;
                ctx.save();
                ctx.translate(x + definition.tileWidth / 2, y + definition.tileHeight / 2);
                ctx.rotate((rotation * Math.PI) / 2);
                ctx.drawImage(texture, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                ctx.restore();
              } else
                ctx.fillRect(
                  x,
                  y,
                  definition.tileWidth + seamOverlap,
                  definition.tileHeight + seamOverlap,
                );
            }
          }
        }
      }
    }
    ctx.restore();
  }

  return paintSurfacePattern;
}
export type PatternPainter = ReturnType<typeof createPatternPainter>;
