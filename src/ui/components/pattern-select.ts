import type { JSX } from 'preact';

import { h } from 'preact';

import type { PatternSelectProps } from './types';

export const PatternSelect = ({ value, onChange, patterns }: PatternSelectProps) =>
  h(
    'label',
    null,
    'Pattern',
    h(
      'select',
      {
        value: value || '',
        onChange: (e: JSX.TargetedEvent<HTMLSelectElement, Event>) =>
          onChange(e.currentTarget.value),
      },
      h('option', { value: '' }, 'No pattern'),
      patterns.map((p) => h('option', { key: p.name, value: p.name }, p.name)),
    ),
  );
