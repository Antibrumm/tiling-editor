import type { PlanChange } from '../model/events';
/** Formats semantic model changes as messages for the action history. */
export class ModelChangeLog {
  describe(change: PlanChange) {
    if (!change || !change.type) return '';
    switch (change.type) {
      case 'light-change':
        return `Changed ${change.lightId} ${change.key} to ${change.value}${['color', 'intensity'].includes(change.key) ? '' : ' mm'}.`;
      case 'light-add':
        return `Added ${change.lightId}.`;
      case 'light-remove':
        return `Removed ${change.lightId}.`;
      case 'surface-placement':
        return `Changed 3D placement of “${change.wallName}” ${change.key} to ${change.value}.`;
      case 'wall-add':
        return `Added wall “${change.wallName}”.`;
      case 'wall-remove':
        return `Removed wall “${change.wallName}”.`;
      case 'wall-rename':
        return `Renamed wall “${change.oldName}” to “${change.newName}”.`;
      case 'wall-move':
        return `Dragged wall “${change.wallName}” to (${change.x}, ${change.y}).`;
      case 'wall-change':
        return `Changed wall “${change.wallName}” ${change.key} to ${change.value}.`;
      case 'wall-reset':
        return `Reset wall “${change.wallName}” to its loaded state.`;
      case 'object-add':
        return `Added element “${change.objectName || 'element'}” to wall “${change.wallName}”.`;
      case 'object-remove':
        return `Removed element “${change.objectName || 'element'}” from wall “${change.wallName}”.`;
      case 'object-reset':
        return `Reset element “${change.objectName || 'element'}” on wall “${change.wallName}” to its loaded state.`;
      case 'object-move':
        return `Dragged element “${change.objectName || 'element'}” on “${change.wallName}” to (${change.x}, ${change.y}).`;
      case 'object-change':
        return `Changed element “${change.objectName || 'element'}” on “${change.wallName}” ${change.key} to ${change.value}.`;
      case 'outline-change':
        return `Changed outline on “${change.wallName}” ${change.key} to ${change.value ?? 'none'}.`;
      case 'pattern-move':
        return `Translated pattern on “${change.wallName}” to (${change.x}, ${change.y}).`;
      case 'pattern-add':
        return `Added pattern “${change.patternName}”.`;
      case 'pattern-duplicate':
        return `Duplicated pattern “${change.patternName}” as “${change.newName}”.`;
      case 'pattern-remove':
        return `Removed pattern “${change.patternName}”.`;
      case 'pattern-rename':
        return `Renamed pattern “${change.oldName}” to “${change.newName}”.`;
      case 'pattern-change':
        return `Changed pattern “${change.patternName}” ${change.key} to ${change.value}.`;
      case 'pattern-region-add':
        return `Added pattern region ${change.index + 1} to “${change.wallName}”.`;
      case 'pattern-region-remove':
        return `Removed pattern region ${change.index + 1} from “${change.wallName}”.`;
      case 'pattern-region-change':
        return `Changed pattern region ${change.index + 1} on “${change.wallName}” ${change.key} to ${change.value}.`;
      case 'pattern-reorder':
        return `Reordered pattern “${change.patternName}”.`;
      case 'wall-reorder':
        return `Reordered wall “${change.wallName}”.`;
      case 'object-reorder':
        return `Reordered element “${change.objectName || 'element'}” on wall “${change.wallName}”.`;
      case 'name-change':
        return `Renamed plan to “${change.name}”.`;
      case 'source-apply':
        return 'Applied YAML source.';
      default:
        return '';
    }
  }
}
