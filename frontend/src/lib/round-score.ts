/** Clamps score to [0,100] and rounds up (ceiling) */
export function roundUpScore(value: number | null | undefined): number {
  if (value == null || isNaN(value)) return 0;
  return Math.ceil(Math.max(0, Math.min(100, value)));
}
