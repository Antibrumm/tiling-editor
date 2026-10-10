import type { Wall } from '../../model/types';

import type { JSX } from 'preact';

import { h } from 'preact';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';

import { Card } from './card';

export function PlacementControls({
  context,
  wall,
  index,
}: { wall: Wall; index: number } & { context: ControlPanelDependencies }) {
  const placement =
    wall.placement3d || context.scenePlacement.suggest(context.effectivePlan.value, wall, index);
  return h(
    Card,
    { context, title: '3D placement' },
    h(
      'div',
      { class: 'coords' },
      h(
        'p',
        { class: 'wide hint' },
        wall.placement3d
          ? 'Explicit placement. X/Y locate the surface on the ground; Z is elevation.'
          : 'Suggested placement. Floor lies on XY; Z is elevation. Edit a value to save explicit placement.',
      ),
      h(
        'label',
        { class: 'wide' },
        'Surface',
        h(
          'select',
          {
            value: placement.type,
            onChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
              context.planService.setPlacement3d(wall.name, 'type', e.currentTarget.value),
          },
          h('option', { value: 'wall' }, 'Vertical wall'),
          h('option', { value: 'floor' }, 'Horizontal floor'),
        ),
      ),
      ...(['x', 'y', 'z'] as const).map((key) =>
        h(NumberField, {
          key,
          label: '3D ' + key.toUpperCase(),
          value: placement[key],
          min: -50000,
          max: 50000,
          onInput: (v) => context.planService.setPlacement3d(wall.name, key, v),
        }),
      ),
      h(NumberField, {
        label: '3D angle',
        value: placement.yaw,
        min: -360,
        max: 360,
        range: true,
        unit: '°',
        onInput: (v) => context.planService.setPlacement3d(wall.name, 'yaw', v),
      }),
    ),
  );
}
