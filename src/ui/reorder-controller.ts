import type { JSX } from 'preact';
import { PlanService } from '../model/plan-service';
import type { ReorderType } from './components/types';
/** Owns sidebar drag payloads and applies reordering through PlanService. */
export class ReorderController {
  public active: { type: ReorderType; index: number; wallName: string } | null = null;
  constructor(private planService: PlanService) {}
  public handlers = (
    type: ReorderType,
    index: number,
    wallName = '',
  ): Pick<JSX.HTMLAttributes<HTMLDetailsElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> => ({
    onDragOver: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      if (
        !this.active ||
        this.active.type !== type ||
        (type === 'object' && this.active.wallName !== wallName)
      )
        return;
      e.preventDefault();
      e.currentTarget.classList.toggle(
        'drop-before',
        e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2,
      );
      e.currentTarget.classList.toggle(
        'drop-after',
        !e.currentTarget.classList.contains('drop-before'),
      );
    },
    onDragLeave: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      e.currentTarget.classList.remove('drop-before', 'drop-after');
    },
    onDrop: (e: JSX.TargetedEvent<HTMLDetailsElement, DragEvent>) => {
      const payload = this.active;
      e.currentTarget.classList.remove('drop-before', 'drop-after');
      if (!payload || payload.type !== type || (type === 'object' && payload.wallName !== wallName))
        return;
      e.preventDefault();
      e.stopPropagation();
      let target =
        index +
        (e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2
          ? 0
          : 1);
      if (payload.index < target) target--;
      if (type === 'pattern') this.planService.reorderPattern(payload.index, target);
      else if (type === 'wall') this.planService.reorderWall(payload.index, target);
      else this.planService.reorderObject(wallName, payload.index, target);
      this.active = null;
    },
  });
}
