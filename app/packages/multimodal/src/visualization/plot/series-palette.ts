/**
 * Categorical series palette, stepped for the fixed dark visualization
 * surface and validated (lightness band, chroma floor, adjacent-pair
 * CVD separation, ≥3:1 contrast on `#050b12`). Slot order maximizes
 * adjacent CVD distance — assign in order, never cycle by hue.
 */
export const PLOT_SERIES_PALETTE: readonly string[] = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];
