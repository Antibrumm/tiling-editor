import type { SelectionHit } from '../model/types';
import { batch } from '@preact/signals';

import { EditorState } from '../ui/editor-state';

/**
 * Applies semantic wall, object, or light hits to an injected EditorState.
 * Updates all selection fields together and invokes the supplied render request.
 * Clearing selection follows the same path without changing persistent plan data.
 */
export class Selection {
  constructor(
    public state: EditorState,
    public requestRender: () => void,
  ) {
    this.state = state;
    this.requestRender = requestRender;
  }
  select(hit: SelectionHit | null) {
    batch(() => {
      this.state.selectedLightId = hit?.type === 'light' ? hit.lightId : null;
      this.state.selectedWallId = hit && hit.type !== 'light' ? hit.wallId : null;
      this.state.selectedObjectName = hit?.type === 'object' ? hit.objectName : null;
      this.state.selectedObjectIndex = hit?.type === 'object' ? hit.objectIndex : null;
    });
    this.requestRender?.();
  }
  clear() {
    this.select(null);
  }
}
