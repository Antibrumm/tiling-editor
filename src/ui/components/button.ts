import { h } from 'preact';

import type { ButtonProps } from './types';

export const Button = ({ children, onClick, className = 'add-element' }: ButtonProps) =>
  h('button', { type: 'button', class: className, onClick }, children);
