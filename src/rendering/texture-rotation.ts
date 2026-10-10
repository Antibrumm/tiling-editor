export const textureRotationQuarter = (column: number, row: number) => {
  let hash = Math.imul(column | 0, 0x45d9f3b) ^ Math.imul(row | 0, 0x119de1f3);
  hash ^= hash >>> 16;
  return hash & 3;
};
