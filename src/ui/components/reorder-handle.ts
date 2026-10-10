import type { JSX } from 'preact';

import { h } from 'preact';

import type { ReorderType } from './types';
import type { ControlPanelDependencies } from '../control-panel-dependencies';

export const ReorderHandle = ({
  context,
  type,
  index,
  wallName = '',
}: {
  type: ReorderType;
  index: number;
  wallName?: string;
} & { context: ControlPanelDependencies }) =>
  h(
    'span',
    {
      class: 'reorder-handle',
      draggable: true,
      role: 'button',
      'aria-label': 'Drag to reorder',
      title: 'Drag to reorder',
      onClick: (e: JSX.TargetedEvent<HTMLSpanElement, MouseEvent>) => {
        e.preventDefault();
        e.stopPropagation();
      },
      onDragStart: (e: JSX.TargetedEvent<HTMLSpanElement, DragEvent>) => {
        e.stopPropagation();
        context.reorder.active = { type, index, wallName };
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', 'reorder');
      },
      onDragEnd: () => {
        context.reorder.active = null;
        document
          .querySelectorAll('.drop-before,.drop-after')
          .forEach((node) => node.classList.remove('drop-before', 'drop-after'));
      },
    },
    '⋮⋮',
  );
