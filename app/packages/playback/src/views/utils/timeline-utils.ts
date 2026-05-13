/**
 * Layout helpers shared by components that render content positioned along
 * the timeline lane (the area to the right of the label column).
 */

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * CSS `calc()` for the horizontal position of something at `ratio` (0–1)
 * across the lane, accounting for the fixed label column on the left.
 */
export const laneLeftCalc = (ratio: number, labelWidth: number) =>
  `calc(${labelWidth}px + (100% - ${labelWidth}px) * ${clamp(ratio, 0, 1)})`;
