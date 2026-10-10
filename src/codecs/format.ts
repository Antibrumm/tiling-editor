export const number = (value: number): string => Number.isFinite(value) ? String(Number(value.toFixed(4))) : '0';
