import { h, Fragment } from 'preact';

import { createPortal } from 'preact/compat';

import type { ControlPanelDependencies } from '../control-panel-dependencies';

import { Button } from './button';

import { PatternCard } from './pattern-card';

import { WallSection } from './wall-section';
import { LightControls } from './light-controls';
import { TileReport } from './tile-report';

export function ControlPanelView({ context }: { context: ControlPanelDependencies }) {
  const plan = context.effectivePlan.value;
  return h(
    Fragment,
    null,
    createPortal(
      context.reportVisibleSignal.value && h(TileReport, { effectivePlan: context.effectivePlan }),
      context.reportView,
    ),
    createPortal(h(LightControls, { context }), context.lightControls),
    createPortal(
      h(
        Fragment,
        null,
        plan.patterns.map((p, i) => h(PatternCard, { context, key: p.name, p, index: i })),
        h(
          Button,
          {
            onClick: () => {
              let i = 1,
                n = `tile-pattern-${i}`;
              while (plan.patterns.some((p) => p.name === n)) n = `tile-pattern-${++i}`;
              context.planService.addPattern({
                name: n,
                tileWidth: 300,
                tileHeight: 300,
                borderSize: 0,
                tileColor: '#ffffff',
                borderColor: '#888888',
              });
            },
          },
          'Add tile pattern',
        ),
      ),
      context.tileControls,
    ),
    createPortal(
      h(
        Fragment,
        null,
        plan.walls.map((wall, i) =>
          h(WallSection, { context, key: wall.name, wall, index: i, patterns: plan.patterns }),
        ),
      ),
      context.wallControls,
    ),
  );
}
