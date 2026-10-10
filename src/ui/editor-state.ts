import type { Plan } from '../model/types';

/**
 * Holds transient selection, view visibility, and an optional drag-preview plan.
 * These values stay outside serialized plan data. The editor entry point connects
 * selection and interaction properties to Signals through property accessors.
 */
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
