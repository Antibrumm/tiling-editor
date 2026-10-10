import type { PatternRegion } from './types';
export type PlanChange =
  | { type: 'upload'; kind: 'YAML' | 'SVG' }
  | { type: 'change' | 'replace' | 'template' | 'source-apply' | 'reset' }
  | { type: 'light-change'; lightId: string; key: string; value: unknown }
  | { type: 'light-add'; lightId: string }
  | { type: 'light-remove'; lightId: string }
  | { type: 'name-change'; oldName: string; name: string }
  | { type: 'wall-move'; wallName: string; x: number; y: number }
  | { type: 'object-move'; wallName: string; objectIndex: number; objectName: string; x: number; y: number }
  | { type: 'surface-placement'; wallName: string; key: string; value: unknown }
  | { type: 'wall-change'; wallName: string; key: string; oldValue: unknown; value: unknown }
  | { type: 'object-change'; wallName: string; index: number; objectName: string; key: string; oldValue: unknown; value: unknown }
  | { type: 'outline-change'; wallName: string; key: string; oldValue: unknown; value: unknown }
  | { type: 'pattern-change'; patternName: string; key: string; oldValue: unknown; value: unknown }
  | { type: 'pattern-move'; wallName: string; x: number; y: number }
  | { type: 'pattern-region-add'; wallName: string; index: number; region: PatternRegion }
  | { type: 'pattern-region-change'; wallName: string; index: number; key: string; oldValue: unknown; value: unknown }
  | { type: 'pattern-region-remove'; wallName: string; index: number; region: PatternRegion }
  | { type: 'wall-rename'; wallName: string; oldName: string; newName: string }
  | { type: 'wall-add'; wallName: string }
  | { type: 'wall-remove'; wallName: string }
  | { type: 'wall-reset'; wallName: string; oldName: string }
  | { type: 'object-add'; wallName: string; index: number; objectName: string }
  | { type: 'object-remove'; wallName: string; index: number; objectName: string }
  | { type: 'object-reset'; wallName: string; index: number; objectName: string }
  | { type: 'pattern-add'; patternName: string }
  | { type: 'pattern-duplicate'; patternName: string; newName: string }
  | { type: 'pattern-remove'; patternName: string }
  | { type: 'pattern-rename'; oldName: string; newName: string }
  | { type: 'pattern-reorder'; patternName: string; fromIndex: number; toIndex: number }
  | { type: 'wall-reorder'; wallName: string; fromIndex: number; toIndex: number }
  | { type: 'object-reorder'; wallName: string; objectName: string; fromIndex: number; toIndex: number };
