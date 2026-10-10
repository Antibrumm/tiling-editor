interface EditorElements {
  'plan-title': HTMLElement;
  'edit-plan-title': HTMLButtonElement;
  'upload-plan': HTMLElement;
  'upload-plan-input': HTMLInputElement;
  'load-template': HTMLButtonElement;
  'open-help': HTMLButtonElement;
  'open-dev-help': HTMLButtonElement;
  'view-title': HTMLElement;
  'three-toggle': HTMLInputElement;
  'source-toggle': HTMLInputElement;
  'split-toggle': HTMLInputElement;
  'view-panels': HTMLElement;
  'preview': HTMLElement;
  'canvas-stage': HTMLElement;
  'plan-canvas': HTMLCanvasElement;
  'zoom-out': HTMLButtonElement;
  'zoom-level': HTMLOutputElement;
  'zoom-in': HTMLButtonElement;
  'zoom-fit': HTMLButtonElement;
  'preview-3d': HTMLElement;
  'three-fit': HTMLButtonElement;
  'three-perspective': HTMLButtonElement;
  'three-top': HTMLButtonElement;
  'three-front': HTMLButtonElement;
  'three-light-toggle': HTMLInputElement;
  'three-status': HTMLElement;
  'source-view': HTMLElement;
  'apply-source': HTMLButtonElement;
  'source-status': HTMLElement;
  'source-highlight': HTMLElement;
  'highlight-code': HTMLElement;
  'source': HTMLTextAreaElement;
  'clear-action-log': HTMLButtonElement;
  'action-console-log': HTMLElement;
  'download': HTMLButtonElement;
  'download-png': HTMLButtonElement;
  'download-yaml': HTMLButtonElement;
  'copy': HTMLButtonElement;
  'reset': HTMLButtonElement;
  'show-labels': HTMLInputElement;
  'show-dimensions': HTMLInputElement;
  'tile-controls': HTMLElement;
  'walls-section': HTMLDetailsElement;
  'wall-controls': HTMLElement;
  'add-wall': HTMLButtonElement;
  'light-controls': HTMLElement;
  'status': HTMLElement;
  'help-dialog': HTMLDialogElement;
  'help-dialog-title': HTMLElement;
  'close-help': HTMLButtonElement;
  'dev-help-dialog': HTMLDialogElement;
  'dev-help-dialog-title': HTMLElement;
  'close-dev-help': HTMLButtonElement;
  'base-model-yaml': HTMLElement;
}
export function getElement<K extends keyof EditorElements>(id: K): EditorElements[K];
export function getElement(id: string): HTMLElement;
export function getElement(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing editor element: ' + id);
  return node;
}
export function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  return context;
}
