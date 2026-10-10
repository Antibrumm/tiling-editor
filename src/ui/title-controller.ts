import { PlanService } from '../model/plan-service';

interface TitleControllerDependencies {
  planService: PlanService;
  planTitle: HTMLElement;
  editPlanTitle: HTMLButtonElement;
}
/**
 * Synchronizes the visible plan title and browser title with PlanService.
 * Uses injected title controls for inline editing: Enter or blur commits, Escape cancels.
 * Committed names flow through PlanService; downloadBaseName supplies a filename-safe
 * version of the current name. Methods are bound for use as event callbacks.
 */
export class TitleController {
  constructor(private dependencies: TitleControllerDependencies) {
    this.update = this.update.bind(this);
    this.downloadBaseName = this.downloadBaseName.bind(this);
    this.beginEdit = this.beginEdit.bind(this);
  }

  public update() {
    const name = this.dependencies.planService.name;
    this.dependencies.planTitle.textContent = name;
    document.title = `${name} · Canvas editor`;
  }
  public downloadBaseName() {
    const safe = this.dependencies.planService.name
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || 'tiling-plan';
  }
  public beginEdit() {
    if (document.getElementById('plan-title-input')) return;
    const input = document.createElement('input');
    input.id = 'plan-title-input';
    input.className = 'title-input';
    input.type = 'text';
    input.value = this.dependencies.planService.name;
    input.setAttribute('aria-label', 'Plan title');
    this.dependencies.planTitle.hidden = true;
    this.dependencies.editPlanTitle.before(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      if (commit) this.dependencies.planService.setName(input.value);
      input.remove();
      this.dependencies.planTitle.hidden = false;
      this.update();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }
}
