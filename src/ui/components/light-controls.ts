import type { JSX } from 'preact';

import { h, Fragment } from 'preact';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';
import { Button } from './button';

import { Card } from './card';

export function LightControls({ context }: { context: ControlPanelDependencies }) {
  const lights = context.effectivePlan.value.lights3d;
  return h(
    Fragment,
    null,
    h(
      'p',
      { class: 'hint' },
      'Coordinates in mm. Position locates the light; Aim selects the point it illuminates. Z is height.',
    ),
    lights.map((light, index) =>
      h(
        Card,
        { context, key: light.id, title: 'Directional light ' + (index + 1), defaultOpen: true },
        h(
          'div',
          { class: 'coords' },
          h(
            'label',
            null,
            'Light color',
            h('input', {
              type: 'color',
              value: light.color,
              onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                context.planService.setLightValue(light.id, 'color', event.currentTarget.value),
            }),
          ),
          h(
            'label',
            null,
            'Intensity',
            h('input', {
              type: 'number',
              value: light.intensity,
              min: 0,
              step: 0.1,
              onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                context.planService.setLightValue(light.id, 'intensity', event.currentTarget.value),
            }),
          ),
          h('strong', { class: 'wide' }, 'Position'),
          ...(['x', 'y', 'z'] as const).map((key) =>
            h(NumberField, {
              key,
              label: 'Position ' + key.toUpperCase(),
              value: light[key],
              min: -50000,
              max: 50000,
              onInput: (value) => context.planService.setLightValue(light.id, key, value),
            }),
          ),
          h('strong', { class: 'wide' }, 'Aim'),
          ...(['aimX', 'aimY', 'aimZ'] as const).map((key) =>
            h(NumberField, {
              key,
              label: 'Aim ' + key.slice(-1),
              value: light[key],
              min: -50000,
              max: 50000,
              onInput: (value) => context.planService.setLightValue(light.id, key, value),
            }),
          ),
          h(
            Button,
            {
              className: 'remove-element wide',
              onClick: () =>
                context.confirmation.open('Remove this directional light?', () =>
                  context.planService.removeLight(light.id),
                ),
            },
            'Remove light',
          ),
        ),
      ),
    ),
    h(Button, { onClick: () => context.planService.addLight() }, 'Add directional light'),
  );
}
