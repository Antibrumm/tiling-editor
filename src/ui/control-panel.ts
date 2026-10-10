import { h, render } from 'preact';
import type { ControlPanelDependencies } from './control-panel-dependencies';
import { ControlPanelView } from './components/control-panel-view';
/** Renders sidebar components with the injected services, state, and portal targets. */
export class ControlPanel {
  constructor(private dependencies: ControlPanelDependencies) {}
  public render(mount: HTMLElement) {
    render(h(ControlPanelView, { context: this.dependencies }), mount);
  }
}
