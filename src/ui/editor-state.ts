import type { Plan } from '../model/types';

export class EditorState {
  selectedWallId: string | null;
  selectedObjectName: string | null;
  selectedObjectIndex: number | null;
  interactionPlan: Plan | null;
  sourceVisible: boolean;
  splitView: boolean;
  constructor() {
    this.selectedWallId = null;
    this.selectedObjectName = null;
    this.selectedObjectIndex = null;
    this.sourceVisible = false;
    this.splitView = false;
    this.interactionPlan = null;
  }
}
