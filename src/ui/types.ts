import type { Plan, Position, SelectionHit } from '../model/types';
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
  hit: SelectionHit | null;
  target: { semantic: SelectionHit } | null;
  initial: number[] | null;
  dragPlan: Plan | null;
  wallRotation: number;
  moved: boolean;
  mode: 'drag' | 'pan';
}
