import { cssVar } from "@voxel51/voodo";

// Series colours for the evaluation charts. The key evaluation takes the
// brand ramp, the comparison takes the chart-blue hue, and the lighter steps
// are tints of the same token. These are CSS expressions: anything that hands
// them to plotly goes through the shared Plotly wrapper, which resolves them
// to concrete values. Typed as `string` so trace literals do not narrow to one
// token and reject the other.
const tint = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

export const KEY_COLOR: string = cssVar.color.brand.primary;
export const SECONDARY_KEY_COLOR: string = cssVar.color.brand.accent;
export const TERTIARY_KEY_COLOR: string = tint(cssVar.color.brand.accent, 60);
export const COMPARE_KEY_COLOR: string = cssVar.color["viz-chart"].blue;
export const COMPARE_KEY_SECONDARY_COLOR: string = tint(
  cssVar.color["viz-chart"].blue,
  60,
);
export const COMPARE_KEY_TERTIARY_COLOR: string = tint(
  cssVar.color["viz-chart"].blue,
  30,
);
export const NONE_CLASS = "(none)";
export const CONFUSION_MATRIX_SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "az", label: "Alphabetical (A-Z)" },
  { value: "za", label: "Alphabetical (Z-A)" },
  { value: "mc", label: "Most common classes" },
  { value: "lc", label: "Least common classes" },
];
export const DEFAULT_BAR_CONFIG = { sortBy: "default" };
export const DEFAULT_CONFUSION_MATRIX_CONFIG = {
  sortBy: "default",
  limit: 100,
  log: true,
};
