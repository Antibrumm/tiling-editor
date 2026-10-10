import type { Plan } from '../model/types';

import { YamlCodec } from '../codecs/yaml';

import type { Signal, ReadonlySignal } from '@preact/signals';

import { SourcePresentation } from '../ui/source-presentation';

import { EditorApp } from '../ui/editor-app';

interface YamlSourceEditorDependencies {
  effectivePlan: ReadonlySignal<Plan>;
  yamlEditingSignal: Signal<boolean>;
  source: HTMLTextAreaElement;
  yamlCodec: YamlCodec;
  sourcePresentation: SourcePresentation;
  app: EditorApp;
  sourceStatus: HTMLElement;
}
export class YamlSourceEditor {
  constructor(private dependencies: YamlSourceEditorDependencies) {
    this.syncFromPlan = this.syncFromPlan.bind(this);
    this.apply = this.apply.bind(this);
  }

  syncFromPlan(plan = this.dependencies.effectivePlan.value) {
    if (this.dependencies.yamlEditingSignal.value) return;
    this.dependencies.source.value = this.dependencies.yamlCodec.encode(plan);
    this.dependencies.sourcePresentation.updateHighlight();
  }

  apply() {
    try {
      const plan = this.dependencies.yamlCodec.decode(this.dependencies.source.value);
      this.dependencies.app.replaceDocument(plan, {
        change: { type: 'source-apply' },
        establishResetPoint: false,
        fitView: true,
      });
      this.dependencies.yamlEditingSignal.value = false;
      this.dependencies.sourceStatus.textContent = 'YAML source applied to preview and controls.';
      this.dependencies.sourceStatus.classList.remove('error');
    } catch (error) {
      this.dependencies.sourceStatus.textContent =
        'Invalid YAML source: ' + (error instanceof Error ? error.message : String(error));
      this.dependencies.sourceStatus.classList.add('error');
    }
  }
}
