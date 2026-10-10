import type { JSX } from 'preact';

import { number } from '../../codecs/format';

import { h } from 'preact';

import type { NumberFieldProps } from './types';

export const NumberField = ({
  label,
  value,
  onInput,
  min = -10000,
  max = 10000,
  range = false,
  unit = ' mm',
}: NumberFieldProps) =>
  h(
    'label',
    { class: range ? 'slider-label' : undefined },
    range
      ? h(
          'span',
          { class: 'slider-heading' },
          h('span', null, label),
          h('output', null, `${number(Number(value) || 0)}${unit}`),
        )
      : label,
    h('input', {
      type: range ? 'range' : 'number',
      value: number(Number(value) || 0),
      min,
      max,
      step: 1,
      onInput: (event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
        onInput(Number(event.currentTarget.value)),
    }),
  );
