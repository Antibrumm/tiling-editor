import type { Wall, Pattern, Point } from '../../model/types';

import type { JSX } from 'preact';

import { number } from '../../codecs/format';

import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import type { ControlPanelDependencies } from '../control-panel-dependencies';
import { NumberField } from './number-field';
import { Button } from './button';
import { EditableName } from './editable-name';
import { ReorderHandle } from './reorder-handle';
import { Card } from './card';
import { PatternRegions } from './pattern-regions';

import { ObjectCard } from './object-card';
import { PlacementControls } from './placement-controls';

export function WallSection({
  context,
  wall,
  index,
  patterns,
}: {
  wall: Wall;
  index: number;
  patterns: Pattern[];
} & { context: ControlPanelDependencies }) {
  const selected = context.selectedWallIdSignal.value === wall.name,
    section = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (selected && section.current) {
      section.current.closest<HTMLDetailsElement>('#walls-section')!.open = true;
      section.current.open = true;
      section.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);
  return h(
    'details',
    {
      class: 'wall-section control-section',
      ref: section,
      ...context.reorder.handlers('wall', index),
    },
    h(
      'summary',
      null,
      h(ReorderHandle, { context, type: 'wall', index }),
      h(EditableName, {
        context,
        title: wall.name,
        onRename: (v) => {
          const next = String(v).trim();
          if (context.planService.renameWall(wall.name, next) && selected)
            context.selectedWallIdSignal.value = next;
        },
        onRemove: () => {
          context.planService.removeWall(wall.name);
          if (selected) context.selection.clear();
        },
        kind: 'wall',
      }),
    ),
    h(
      'div',
      { class: 'wall-content' },
      h(
        Card,
        {
          context,
          title: wall.name,
          selected: selected && context.selectedObjectIndexSignal.value === null,
        },
        h(
          Button,
          { className: 'card-reset', onClick: () => context.resetWallToLoadedState(wall.name) },
          'Reset wall',
        ),
        h(
          'div',
          { class: 'coords' },
          ...(['x', 'y', 'rotation'] as const).map((key) =>
            h(NumberField, {
              key,
              label: key === 'rotation' ? 'Rotation' : key.toUpperCase(),
              value: wall[key],
              min: key === 'rotation' ? 0 : -10000,
              max: key === 'rotation' ? 359 : 10000,
              range: true,
              unit: key === 'rotation' ? '' : ' mm',
              onInput: (v) =>
                context.planService.setWallValue(
                  wall.name,
                  key,
                  key === 'rotation' ? v : Math.round(v),
                ),
            }),
          ),
        ),
      ),
      h(
        Card,
        { context, title: 'outline' },
        h(
          'div',
          { class: 'coords' },
          h(NumberField, {
            label: 'Pattern inset (mm)',
            value: wall.outline.patternInset,
            min: 0,
            onInput: (v) => context.planService.setOutlineValue(wall.name, 'patternInset', v),
          }),
          h(
            'label',
            { class: 'wide' },
            'Points',
            h('textarea', {
              defaultValue: wall.outline.points
                .map((p) => `${number(p[0])},${number(p[1])}`)
                .join(' '),
              onInput: (e: JSX.TargetedEvent<HTMLTextAreaElement, Event>) => {
                const points = e.currentTarget.value
                  .trim()
                  .split(/\s+/)
                  .map((pair) => pair.split(',').map(Number))
                  .filter((p): p is Point => p.length === 2 && p.every(Number.isFinite));
                if (points.length >= 3) context.planService.setOutlinePoints(wall.name, points);
              },
            }),
          ),
        ),
      ),
      h(PatternRegions, { context, wall, patterns }),
      wall.objects.map((o, i) => h(ObjectCard, { context, key: i, wall, o, index: i })),
      h(
        Button,
        {
          onClick: () =>
            context.planService.addObject(wall.name, {
              name: 'element',
              x: 0,
              y: 0,
              width: 600,
              height: 600,
              fill: '#ff0000',
            }),
        },
        'Add element',
      ),
      h(
        Button,
        {
          onClick: () =>
            context.planService.setWallValue(wall.name, 'rotation', (wall.rotation + 90) % 360),
        },
        'Rotate 90°',
      ),
      context.threePreviewVisibleSignal.value && h(PlacementControls, { context, wall, index }),
    ),
  );
}
