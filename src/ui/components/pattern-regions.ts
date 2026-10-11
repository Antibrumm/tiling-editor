import type { Wall, Pattern } from '../../model/types';

import { h, type JSX } from 'preact';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';
import { Button } from './button';
import { PatternSelect } from './pattern-select';

import { Card } from './card';

export const PatternRegions = ({
  context,
  wall,
  patterns,
}: { wall: Wall; patterns: Pattern[] } & { context: ControlPanelDependencies }) =>
  h(
    'div',
    { class: 'pattern-regions' },
    wall.patternRegions.map((r, i) =>
      h(
        Card,
        {
          context,
          key: i,
          title: r.fullWall ? `Pattern region ${i + 1} · Full wall` : `Pattern region ${i + 1}`,
          defaultOpen: true,
        },
        h(
          'div',
          { class: 'coords' },
          h(
            'label',
            { class: 'wide' },
            h('input', {
              type: 'checkbox',
              checked: r.fullWall,
              disabled: !r.fullWall && wall.patternRegions.some((region) => region.fullWall),
              onChange: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                context.planService.setPatternRegion(
                  wall.name,
                  i,
                  'fullWall',
                  event.currentTarget.checked,
                ),
            }),
            ' Full wall (follows outline)',
          ),
          ...(!r.fullWall ? (['x', 'y', 'width', 'height'] as const) : []).map((key) =>
            h(NumberField, {
              key,
              label: key[0].toUpperCase() + key.slice(1),
              value: r[key],
              min: key === 'width' || key === 'height' ? 0 : -10000,
              onInput: (v) => context.planService.setPatternRegion(wall.name, i, key, v),
            }),
          ),
          h(PatternSelect, {
            value: r.pattern,
            patterns,
            onChange: (v) => context.planService.setPatternRegion(wall.name, i, 'pattern', v),
          }),
          ...(['patternX', 'patternY'] as const).map((key) =>
            h(NumberField, {
              key,
              label: key === 'patternX' ? 'Pattern X' : 'Pattern Y',
              value: r[key],
              min: -6000,
              max: 6000,
              range: true,
              onInput: (v) => context.planService.setPatternRegion(wall.name, i, key, v),
            }),
          ),
          h(NumberField, {
            label: 'Pattern rotation',
            value: r.patternRotation,
            min: 0,
            max: 359,
            range: true,
            unit: '°',
            onInput: (v) =>
              context.planService.setPatternRegion(wall.name, i, 'patternRotation', v),
          }),
          h(
            Button,
            {
              className: 'remove-element wide',
              onClick: () => context.planService.removePatternRegion(wall.name, i),
            },
            'Remove region',
          ),
        ),
      ),
    ),
    !wall.patternRegions.some((region) => region.fullWall) &&
      h(
        Button,
        {
          onClick: () =>
            context.planService.addPatternRegion(wall.name, {
              fullWall: true,
              pattern: patterns[0]?.name || '',
            }),
        },
        'Add full-wall pattern',
      ),
    h(
      Button,
      {
        onClick: () =>
          context.planService.addPatternRegion(wall.name, {
            x: 0,
            y: 0,
            width: 600,
            height: 600,
            pattern: patterns[0]?.name || '',
          }),
      },
      'Add pattern region',
    ),
  );
