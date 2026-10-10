import type { JSX } from 'preact';

import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { EditableNameProps } from './types';
import type { ControlPanelDependencies } from '../control-panel-dependencies';

export function EditableName({
  context,
  title,
  onRename,
  onRemove,
  kind,
}: EditableNameProps & { context: ControlPanelDependencies }) {
  const [editing, setEditing] = useState(false),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  const finish = (commit: boolean) => {
    if (commit) onRename?.(input.current?.value || '');
    setEditing(false);
  };
  return h(
    'span',
    { class: 'control-name' },
    editing
      ? h('input', {
          ref: input,
          class: 'control-name-input',
          defaultValue: title,
          onClick: (e: JSX.TargetedEvent<HTMLInputElement, MouseEvent>) => e.stopPropagation(),
          onPointerDown: (e: JSX.TargetedEvent<HTMLInputElement, PointerEvent>) =>
            e.stopPropagation(),
          onBlur: () => finish(true),
          onKeyDown: (e: JSX.TargetedEvent<HTMLInputElement, KeyboardEvent>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(true);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              finish(false);
            }
          },
        })
      : h('strong', null, title),
    onRename &&
      h(
        'button',
        {
          type: 'button',
          class: 'control-name-edit',
          'aria-label': `Edit ${title} name`,
          title: 'Edit name',
          onPointerDown: (e: JSX.TargetedEvent<HTMLButtonElement, PointerEvent>) =>
            e.preventDefault(),
          onClick: (e: JSX.TargetedEvent<HTMLButtonElement, MouseEvent>) => {
            e.preventDefault();
            e.stopPropagation();
            setEditing(true);
          },
        },
        '✎',
      ),
    onRemove &&
      h(
        'button',
        {
          type: 'button',
          class: 'control-name-remove',
          'aria-label': `Remove ${kind} ${title}`,
          onClick: (e: JSX.TargetedEvent<HTMLButtonElement, MouseEvent>) => {
            e.preventDefault();
            e.stopPropagation();
            context.confirmation.open(`Remove ${kind} “${title}”?`, onRemove);
          },
        },
        '×',
      ),
  );
}
