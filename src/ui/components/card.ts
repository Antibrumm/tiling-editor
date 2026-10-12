import { h, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import type { CardProps } from './types';
import type { ControlPanelDependencies } from '../control-panel-dependencies';

import { EditableName } from './editable-name';
import { ReorderHandle } from './reorder-handle';

export function Card({
  context,
  title,
  children,
  onRename,
  onRemove,
  onSelect,
  kind = 'item',
  reorder,
  selected = false,
  defaultOpen = false,
}: CardProps & { context: ControlPanelDependencies }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!selected) return;
    const node = ref.current;
    if (node) {
      context.sidebarSections.reveal(node);
    }
  }, [selected]);
  return h(
    'details',
    {
      class: 'group-card' + (selected ? ' selected' : ''),
      ref,
      open: defaultOpen ? true : undefined,
      ...(reorder ? context.reorder.handlers(...reorder) : {}),
    },
    h(
      'summary',
      {
        class: 'group-top',
        onClick: (event: JSX.TargetedEvent<HTMLElement, MouseEvent>) => {
          if (event.target instanceof Element && event.target.closest('button, input')) return;
          onSelect?.();
        },
      },
      reorder &&
        h(ReorderHandle, { context, type: reorder[0], index: reorder[1], wallName: reorder[2] }),
      onRename || onRemove
        ? h(EditableName, { context, title, onRename, onRemove, kind })
        : h('strong', null, title),
    ),
    children,
  );
}
