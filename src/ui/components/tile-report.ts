import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import type { ReadonlySignal } from '@preact/signals';
import type { Plan } from '../../model/types';
import { TileReportService } from '../../model/tile-report-service';

export function TileReport({
  effectivePlan,
  showTitle = true,
}: {
  effectivePlan: ReadonlySignal<Plan>;
  showTitle?: boolean;
}) {
  const plan = effectivePlan.value;
  const service = useMemo(() => new TileReportService(), []);
  const { walls, wallAreaM2: wallArea, regionAreaM2, tileTypes } = service.analyze(plan);
  const complete = regionAreaM2 !== null;
  const regionArea = regionAreaM2 ?? 0;
  const area = (value: number) =>
    `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} m²`;
  return h(
    'div',
    { class: 'tile-report-content' },
    showTitle && h('h2', null, plan.name),
    h(
      'p',
      { class: 'report-room-summary' },
      h('strong', null, 'Complete room'),
      h('span', null, `Wall area: ${area(wallArea)}`),
      h('span', null, `Tile region area: ${complete ? area(regionArea) : 'Unavailable'}`),
    ),
    tileTypes.size > 0 &&
      h(
        'div',
        { class: 'report-table-wrap report-tile-totals' },
        h(
          'table',
          null,
          h('caption', null, 'Tiles needed for the complete room'),
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ['Tile type', 'Area', 'Tiles needed'].map((label) =>
                h('th', { scope: 'col', key: label }, label),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            [...tileTypes].map(([name, total]) =>
              h(
                'tr',
                { key: name },
                h('th', { scope: 'row' }, name),
                h('td', null, total.complete ? area(total.areaM2) : 'Unavailable'),
                h('td', null, total.complete ? total.count.toLocaleString() : 'Unavailable'),
              ),
            ),
          ),
        ),
      ),
    h(
      'p',
      { class: 'hint' },
      'Wall areas cover the complete outline. Tile region areas cover visible tiling, including grout, after inset and overlapping regions. Each partial tile counts as one; offcuts are not reused.',
    ),
    !plan.walls.length &&
      h('p', { class: 'report-empty' }, 'Load an example or upload a plan to see its tile report.'),
    walls.map(({ wall, result, areaM2 }) => {
      return h(
        'section',
        { class: 'report-wall', key: wall.name },
        h('h3', null, wall.name),
        h('p', { class: 'report-wall-area' }, `Wall area: ${area(areaM2)}`),
        !wall.patternRegions.length
          ? h('p', { class: 'hint' }, 'No tile regions.')
          : h(
              'div',
              { class: 'report-table-wrap' },
              h(
                'table',
                null,
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    ['Tile region', 'Area', 'Selected tile', 'Tiles needed'].map((label) =>
                      h('th', { scope: 'col', key: label }, label),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  wall.patternRegions.map((region, index) => {
                    const detail = result?.regions[index];
                    return h(
                      'tr',
                      { key: index },
                      h(
                        'th',
                        { scope: 'row' },
                        `Tile region ${index + 1}${region.fullWall ? ' · Full wall' : ''}`,
                      ),
                      h('td', null, detail ? area(detail.areaM2) : 'Unavailable'),
                      h('td', null, region.pattern || 'No tile selected'),
                      h('td', null, detail ? detail.count.toLocaleString() : 'Unavailable'),
                    );
                  }),
                ),
              ),
            ),
        !result &&
          h(
            'p',
            { class: 'hint' },
            'Region results are unavailable because this layout exceeds the calculation limit.',
          ),
      );
    }),
  );
}
