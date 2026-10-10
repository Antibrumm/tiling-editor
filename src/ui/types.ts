import type { Plan, Position, SurfaceSelectionHit } from '../model/types';
export type ViewBox = [number, number, number, number];
export interface ViewState {
  scale: number;
  box: ViewBox;
}
export interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startWorld: Position;
  hit: SurfaceSelectionHit | null;
  target: { semantic: SurfaceSelectionHit } | null;
  initial: number[] | null;
  dragPlan: Plan | null;
  wallRotation: number;
  moved: boolean;
  mode: 'drag' | 'pan';
}
