import type { Wall, PlanObject } from '../../model/types';

import type { JSX } from 'preact';

import { h } from 'preact';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';
import { Button } from './button';

import { Card } from './card';

export function ObjectCard({
  context,
  wall,
  o,
  index,
}: { wall: Wall; o: PlanObject; index: number } & { context: ControlPanelDependencies }) {
  const selected =
    context.selectedWallIdSignal.value === wall.name &&
    context.selectedObjectIndexSignal.value === index;
  return h(
    Card,
    {
      context,
      title: o.name,
      key: index,
      selected,
      onRename: (v) => context.planService.setObjectValue(wall.name, index, 'name', v),
      onRemove: () => {
        context.planService.removeObject(wall.name, index);
        if (selected) context.selection.clear();
      },
      kind: 'element',
      reorder: ['object', index, wall.name],
    },
    h(
      Button,
      {
        className: 'card-reset',
        onClick: () => context.resetObjectToLoadedState(wall.name, index),
      },
      'Reset element',
    ),
    h(
      'div',
      { class: 'coords' },
      ...(
        [
          ['x', 'X', -6000, 6000],
          ['y', 'Y', -6000, 6000],
          ['width', 'Width', 1, 6000],
          ['height', 'Height', 1, 6000],
        ] as const
      ).map(([key, label, min, max]) =>
        h(NumberField, {
          key,
          label,
          value: o[key],
          min,
          max,
          range: true,
          onInput: (v) =>
            context.planService.setObjectValue(
              wall.name,
              index,
              key,
              key === 'x' || key === 'y' ? Math.round(v) : v,
            ),
        }),
      ),
      h(NumberField, {
        label: '3D depth / floor height',
        value: o.depth,
        min: 1,
        max: 6000,
        onInput: (v) => context.planService.setObjectValue(wall.name, index, 'depth', v),
      }),
      h(
        'label',
        null,
        'Fill',
        h('input', {
          type: 'color',
          value: /^#[0-9a-f]{6}$/i.test(o.fill) ? o.fill : '#ff0000',
          onInput: (e: JSX.TargetedEvent<HTMLInputElement, Event>) =>
            context.planService.setObjectValue(wall.name, index, 'fill', e.currentTarget.value),
        }),
      ),
    ),
  );
}
