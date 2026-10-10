import type { Pattern } from '../../model/types';

import type { JSX } from 'preact';

import { h } from 'preact';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';
import { Button } from './button';

import { Card } from './card';

export function PatternCard({
  context,
  p,
  index,
}: { p: Pattern; index: number } & { context: ControlPanelDependencies }) {
  const set = (key: string, value: unknown) =>
    context.planService.setPatternValue(p.name, key, value);
  return h(
    Card,
    {
      context,
      title: p.name,
      onRename: (v) => context.planService.renamePattern(p.name, v),
      onRemove: () => {
        if (!context.planService.removePattern(p.name))
          context.uiFeedback.message(`Pattern “${p.name}” is still used by a wall.`);
      },
      kind: 'tile pattern',
      reorder: ['pattern', index],
    },
    h(
      'div',
      { class: 'coords' },
      ...(
        [
          ['tileWidth', 'Tile width', 1, 6000],
          ['tileHeight', 'Tile height', 1, 6000],
          ['borderSize', 'Border size', 0, 1000],
        ] as const
      ).map(([key, label, min, max]) =>
        h(NumberField, { key, label, value: p[key], min, max, onInput: (v) => set(key, v) }),
      ),
      h(
        'label',
        null,
        'Tile',
        h('input', {
          type: 'color',
          value: /^#[0-9a-f]{6}$/i.test(p.tileColor) ? p.tileColor : '#ffffff',
          onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
            set('tileColor', e.currentTarget.value),
        }),
      ),
      h(
        'label',
        null,
        'Border',
        h('input', {
          type: 'color',
          value: /^#[0-9a-f]{6}$/i.test(p.borderColor) ? p.borderColor : '#888888',
          onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
            set('borderColor', e.currentTarget.value),
        }),
      ),
      h(
        'div',
        { class: 'wide' },
        h(
          Button,
          { onClick: () => context.planService.duplicatePattern(p.name) },
          'Duplicate pattern',
        ),
        h(
          Button,
          {
            onClick: (e: JSX.TargetedEvent<HTMLElement, MouseEvent>) =>
              (e.currentTarget.nextElementSibling as HTMLInputElement | null)?.click(),
          },
          p.tileTexture ? 'Replace texture' : 'Upload texture',
        ),
        h('input', {
          type: 'file',
          accept: 'image/*',
          hidden: true,
          onChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) => {
            const file = e.currentTarget.files?.[0];
            if (file) {
              const reader: FileReader = new FileReader();
              reader.onload = () => set('tileTexture', String(reader.result || ''));
              reader.readAsDataURL(file);
            }
          },
        }),
        p.tileTexture && h(Button, { onClick: () => set('tileTexture', '') }, 'Remove texture'),
      ),
      h(
        'label',
        { class: 'wide' },
        h('input', {
          type: 'checkbox',
          checked: !!p.randomTextureRotation,
          style: 'width:auto;display:inline-block;margin:0 7px 0 0',
          onChange: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
            set('randomTextureRotation', e.currentTarget.checked),
        }),
        'Random texture rotation',
      ),
    ),
  );
}
