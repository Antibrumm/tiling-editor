import { h } from 'preact';
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
      node.open = true;
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);
  return h(
    'details',
    {
      class: 'group-card',
      ref,
      open: defaultOpen ? true : undefined,
      ...(reorder ? context.reorder.handlers(...reorder) : {}),
    },
    h(
      'summary',
      { class: 'group-top' },
      reorder &&
        h(ReorderHandle, { context, type: reorder[0], index: reorder[1], wallName: reorder[2] }),
      onRename || onRemove
        ? h(EditableName, { context, title, onRename, onRemove, kind })
        : h('strong', null, title),
    ),
    children,
  );
}
