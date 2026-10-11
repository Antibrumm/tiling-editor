import type { ComponentChildren, JSX } from 'preact';
import type { Pattern } from '../../model/types';
export type ReorderType = 'pattern' | 'wall' | 'object';
export interface NumberFieldProps {
  label: string;
  value: number;
  onInput: (value: number) => void;
  min?: number;
  max?: number;
  range?: boolean;
  unit?: string;
}
export interface ButtonProps {
  children?: ComponentChildren;
  onClick: JSX.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}
export interface PatternSelectProps {
  value: string;
  onChange: (value: string) => void;
  patterns: Pattern[];
}
export interface EditableNameProps {
  title: string;
  onRename?: (value: string) => void;
  onRemove?: () => void;
  kind: string;
}
export interface CardProps {
  title: string;
  children?: ComponentChildren;
  onRename?: (value: string) => void;
  onRemove?: () => void;
  onSelect?: () => void;
  kind?: string;
  reorder?: [ReorderType, number, string?];
  selected?: boolean;
  defaultOpen?: boolean;
}
