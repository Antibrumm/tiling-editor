import { PlanNormalizer } from '../model/plan-normalizer';
import type { Plan, PlanInput } from '../model/types';
import { number } from './format';
// Parser records stay untyped until normalization coerces the supported fields.
interface ParsedItem {
  [key: string]: unknown;
  outline?: Record<string, unknown>;
  placement3d?: Record<string, unknown>;
  objects?: Record<string, unknown>[];
  patternRegions?: Record<string, unknown>[];
}
interface ParsedPlan {
  [key: string]: unknown;
  patterns: ParsedItem[];
  walls: ParsedItem[];
  lights3d?: ParsedItem[];
  light3d?: Record<string, unknown>;
}

/**
 * Encodes and decodes the editor's indentation-sensitive tiling-plan YAML format.
 * Uses an injected PlanNormalizer to supply model defaults and migrate older documents.
 * Supports the project's schema rather than general YAML syntax; parsing errors are
 * reported to the caller, which decides how to present them to the user.
 */
export class YamlCodec {
  constructor(private normalizer = new PlanNormalizer()) {}
  private scalar(value: unknown) {
    const t = String(value ?? '');
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(t) ? t : JSON.stringify(t);
  }
  public encode(planInput: Plan) {
    const plan = planInput;
    const lines = [
      'format: tiling-plan',
      'upAxis3d: z',
      `name: ${this.scalar(plan.name)}`,
      'patterns:',
    ];
    lines.splice(
      lines.length - 1,
      0,
      plan.lights3d.length ? 'lights3d:' : 'lights3d: []',
      ...plan.lights3d.flatMap((light) => [
        '  - id: ' + this.scalar(light.id),
        ...Object.entries(light)
          .filter(([key]) => key !== 'id')
          .map(
            ([key, value]) =>
              '    ' +
              key +
              ': ' +
              (typeof value === 'string' ? this.scalar(value) : number(value)),
          ),
      ]),
    );
    for (const p of plan.patterns)
      lines.push(
        `  - name: ${this.scalar(p.name)}`,
        `    tileWidth: ${number(p.tileWidth)}`,
        `    tileHeight: ${number(p.tileHeight)}`,
        `    borderSize: ${number(p.borderSize)}`,
        `    tileColor: ${this.scalar(p.tileColor)}`,
        `    borderColor: ${this.scalar(p.borderColor)}`,
        `    tileTexture: ${this.scalar(p.tileTexture || '')}`,
        `    randomTextureRotation: ${p.randomTextureRotation ? 'true' : 'false'}`,
      );
    lines.push('walls:');
    for (const w of plan.walls) {
      lines.push(
        `  - name: ${this.scalar(w.name)}`,
        `    x: ${number(w.x)}`,
        `    y: ${number(w.y)}`,
        `    rotation: ${number(w.rotation)}`,
        '    outline:',
        `      points: ${JSON.stringify(w.outline.points.map((p) => `${number(p[0])},${number(p[1])}`).join(' '))}`,
      );
      if (w.placement3d) {
        lines.splice(
          lines.length - 2,
          0,
          '    placement3d:',
          ...Object.entries(w.placement3d).map(
            ([key, value]) =>
              '      ' +
              key +
              ': ' +
              (typeof value === 'string' ? this.scalar(value) : number(value)),
          ),
        );
      }
      lines.push(
        `      patternInset: ${number(w.outline.patternInset)}`,
        `      fill: ${this.scalar(w.outline.fill)}`,
        `      stroke: ${this.scalar(w.outline.stroke)}`,
        `      strokeWidth: ${number(w.outline.strokeWidth)}`,
      );
      lines.push(
        `      pattern: ${this.scalar(w.outline.pattern)}`,
        `      patternX: ${number(w.outline.patternX)}`,
        `      patternY: ${number(w.outline.patternY)}`,
        `      patternRotation: ${number(w.outline.patternRotation || 0)}`,
      );
      if (w.patternRegions?.length) {
        lines.push('    patternRegions:');
        for (const r of w.patternRegions)
          lines.push(
            `      - x: ${number(r.x)}`,
            `        y: ${number(r.y)}`,
            `        width: ${number(r.width)}`,
            `        height: ${number(r.height)}`,
            `        pattern: ${this.scalar(r.pattern)}`,
            `        patternX: ${number(r.patternX)}`,
            `        patternY: ${number(r.patternY)}`,
            `        patternRotation: ${number(r.patternRotation || 0)}`,
          );
      }
      if (w.objects.length) {
        lines.push('    objects:');
        for (const o of w.objects)
          lines.push(
            `      - name: ${this.scalar(o.name || 'element')}`,
            `        x: ${number(o.x)}`,
            `        y: ${number(o.y)}`,
            `        width: ${number(o.width)}`,
            `        height: ${number(o.height)}`,
            `        fill: ${this.scalar(o.fill || 'red')}`,
            `        depth: ${number(o.depth || 10)}`,
          );
      }
    }
    return lines.join('\n');
  }
  private parseScalar(raw: string): unknown {
    const v = raw.trim();
    if (!v) return '';
    if (v.startsWith('"') && v.endsWith('"')) {
      try {
        return JSON.parse(v);
      } catch {}
    }
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(v)) return Number(v);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    return v;
  }
  public decode(text: string): Plan {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const raw: ParsedPlan = { patterns: [], walls: [] };
    let section = '',
      item: ParsedItem | null = null,
      sub = '';
    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = (line.match(/^\s*/) || [''])[0].length,
        t = line.trim();
      if (indent === 0) {
        const m = t.match(/^([^:]+):\s*(.*)$/);
        if (!m) continue;
        const k = m[1],
          v = m[2];
        if (['canvas', 'patterns', 'walls', 'light3d', 'lights3d'].includes(k)) {
          section = k;
          item = null;
          sub = '';
          if (k === 'lights3d') raw.lights3d = [];
        } else raw[k] = this.parseScalar(v);
        continue;
      }
      if (section === 'lights3d') {
        if (t.startsWith('- ')) {
          item = {};
          raw.lights3d!.push(item);
          const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
          if (m) item[m[1]] = this.parseScalar(m[2]);
        } else {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m && item) item[m[1]] = this.parseScalar(m[2]);
        }
        continue;
      }
      if (section === 'light3d') {
        raw.light3d ||= {};
        const m = t.match(/^([^:]+):\s*(.*)$/);
        if (m) raw.light3d[m[1]] = this.parseScalar(m[2]);
        continue;
      }
      if (section === 'canvas') continue;
      if (section === 'patterns') {
        if (t.startsWith('- ')) {
          item = {};
          raw.patterns.push(item);
          const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
          if (m) item[m[1]] = this.parseScalar(m[2]);
        } else {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m && item) item[m[1]] = this.parseScalar(m[2]);
        }
        continue;
      }
      if (section === 'walls') {
        if (indent === 2 && t.startsWith('- ')) {
          item = { outline: {}, objects: [] };
          raw.walls.push(item);
          sub = '';
          const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
          if (m) item[m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (!item) continue;
        if (indent === 4 && t === 'placement3d:') {
          sub = 'placement3d';
          item.placement3d = {};
          continue;
        }
        if (indent === 4 && t === 'outline:') {
          sub = 'outline';
          continue;
        }
        if (indent === 4 && (t === 'objects:' || t === 'objects: []')) {
          sub = 'objects';
          continue;
        }
        if (indent === 4 && (t === 'patternRegions:' || t === 'patternRegions: []')) {
          sub = 'patternRegions';
          item.patternRegions = [];
          continue;
        }
        if (indent === 4) {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m) item[m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'placement3d' && indent >= 6) {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m) item.placement3d![m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'outline' && indent >= 6) {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m) item.outline![m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'patternRegions' && indent === 6 && t.startsWith('- ')) {
          const r: Record<string, unknown> = {};
          item.patternRegions!.push(r);
          const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
          if (m) r[m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'patternRegions' && indent >= 8 && item.patternRegions!.length) {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m)
            item.patternRegions![item.patternRegions!.length - 1][m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'objects' && indent === 6 && t.startsWith('- ')) {
          const o: Record<string, unknown> = {};
          item.objects!.push(o);
          const m = t.slice(2).match(/^([^:]+):\s*(.*)$/);
          if (m) o[m[1]] = this.parseScalar(m[2]);
          continue;
        }
        if (sub === 'objects' && indent >= 8 && item.objects!.length) {
          const m = t.match(/^([^:]+):\s*(.*)$/);
          if (m) item.objects![item.objects!.length - 1][m[1]] = this.parseScalar(m[2]);
        }
      }
    }
    if (!raw.walls.length) throw new Error('Expected at least one wall.');
    for (const w of raw.walls) {
      const text = String(w.outline?.points || '').trim();
      w.outline ||= {};
      w.outline.points = text
        ? text
            .split(/\s+/)
            .map((pair) => pair.split(',').map(Number))
            .filter((p) => p.length === 2 && p.every(Number.isFinite))
        : [];
    }
    return this.normalizer.normalizeData(raw as unknown as PlanInput);
  }
}
