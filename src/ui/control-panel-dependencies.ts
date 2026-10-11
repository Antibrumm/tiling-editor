import type { Signal, ReadonlySignal } from '@preact/signals';
import type { Plan } from '../model/types';
import type { PlanService } from '../model/plan-service';
import type { ScenePlacement } from '../model/scene-placement';
import type { UiFeedback } from './feedback';
import type { Selection } from './selection';
import type { ReorderController } from './reorder-controller';
import type { ConfirmationDialog } from './confirmation-dialog';
/** Shared services, reactive state, and targets supplied to sidebar components. */
export interface ControlPanelDependencies {
  planService: PlanService;
  uiFeedback: UiFeedback;
  selectedWallIdSignal: Signal<string | null>;
  selectedLightIdSignal: Signal<string | null>;
  selectedObjectIndexSignal: Signal<number | null>;
  selection: Selection;
  resetObjectToLoadedState: (wallName: string, objectIndex: number) => void;
  scenePlacement: ScenePlacement;
  effectivePlan: ReadonlySignal<Plan>;
  threePreviewVisibleSignal: ReadonlySignal<boolean>;
  resetWallToLoadedState: (wallName: string) => void;
  lightControls: HTMLElement;
  tileControls: HTMLElement;
  wallControls: HTMLElement;
  reorder: ReorderController;
  confirmation: ConfirmationDialog;
}
