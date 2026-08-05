/**
 * Point, legend, and hover-swatch colors, all resolved from the App's
 * color scheme so nothing the panel draws can drift from the grid.
 */
import { getRGB, type RGB } from "@fiftyone/utilities";
import type { ColorMeta, ColorValues } from "./protocol";

export const MISSING_CATEGORY = 0xffff;

/** Points the color-by field has no value for (and unparseable colors) */
export const MISSING_CSS = "#737373";

/** Ramp for deployments whose color scheme configures no colorscale */
const DEFAULT_RAMP: readonly RGB[] = [
  [38, 102, 230],
  [255, 166, 0],
];

/** The label attribute the grid colors by when a field configures none */
const DEFAULT_ATTRIBUTE = "label";

const RAMP_STEPS = 256;

export interface PlotPalette {
  /** CSS color per class index, aligned to the field's `classes` */
  classes: readonly string[];
  /** Continuous ramp stops, low -> high, 0-255 channels */
  ramp: readonly RGB[];
}

/** Palette for an uncolored plot — never reaches the renderer */
export const EMPTY_PALETTE: PlotPalette = { classes: [], ramp: DEFAULT_RAMP };

const toUnitRgb = (
  css: string | null | undefined,
): [number, number, number] | null => {
  if (typeof css !== "string") return null;
  const rgb = getRGB(css);
  if (!rgb.every((channel) => Number.isFinite(channel))) return null;
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
};

const MISSING_RGB = toUnitRgb(MISSING_CSS) as [number, number, number];

interface FieldSetting {
  path?: string | null;
  colorByAttribute?: string | null;
  valueColors?: readonly { value: string; color: string }[] | null;
}

interface Colorscale {
  name?: string | null;
  path?: string | null;
  /** Resolved stops — the App carries these outside its input types */
  rgb?: RGB[] | null;
}

/**
 * Per-value overrides that apply to a color-by path: a primitive field
 * carries its own, a label field carries its labels' — the latter only
 * while the grid colors by that same attribute.
 */
const valueColorsFor = (
  fields: readonly FieldSetting[] | null | undefined,
  path: string,
): Map<string, string> => {
  const dot = path.lastIndexOf(".");
  const setting =
    fields?.find((field) => field.path === path) ??
    (dot > 0
      ? fields?.find(
          (field) =>
            field.path === path.slice(0, dot) &&
            (field.colorByAttribute ?? DEFAULT_ATTRIBUTE) ===
              path.slice(dot + 1),
        )
      : undefined);

  return new Map(
    (setting?.valueColors ?? []).map(({ value, color }) => [
      String(value),
      color,
    ]),
  );
};

/**
 * Resolves the App's color scheme into the palette for one color-by
 * field. Classes resolve by VALUE — a plot colored by field would be one
 * flat color — through the same seeded pool generator and per-value
 * overrides the grid uses, so a class matches its labels in the grid
 * whenever the grid is coloring by value.
 */
export function resolvePalette({
  field,
  meta,
  colorMap,
  fields,
  colorscales,
  defaultColorscale,
  configColorscale,
}: {
  field: string | null;
  meta: ColorMeta | null;
  /** The App's seeded pool generator (`fos.colorMap`) */
  colorMap: (value: string) => string;
  fields?: readonly FieldSetting[] | null;
  colorscales?: readonly Colorscale[] | null;
  defaultColorscale?: Colorscale | null;
  configColorscale?: RGB[] | null;
}): PlotPalette {
  const overrides = field ? valueColorsFor(fields, field) : new Map();
  const classes = (
    meta?.style === "categorical" ? (meta.classes ?? []) : []
  ).map(({ label }) => {
    const value = String(label);
    const custom = overrides.get(value);
    // An override the renderer cannot parse falls back to the pool, not
    // to gray — a bad color must not erase the class
    return toUnitRgb(custom) ? (custom as string) : colorMap(value);
  });

  const ramp =
    (field
      ? colorscales?.find((scale) => scale.path === field)?.rgb
      : undefined) ??
    defaultColorscale?.rgb ??
    configColorscale ??
    DEFAULT_RAMP;

  return { classes, ramp: ramp.length ? ramp : DEFAULT_RAMP };
}

/**
 * The CSS color a categorical class index maps to. The single source for
 * legend swatches and hover swatches, so they cannot drift from the
 * point colors buildColors assigns.
 */
export const categoryCss = (palette: PlotPalette, index: number): string =>
  palette.classes[index] ?? MISSING_CSS;

let cachedRamp: readonly RGB[] | null = null;
let cachedSteps: Uint8Array | null = null;

/**
 * The ramp quantized to 256 stops, 0-255 channels. Point colors and the
 * legend gradient both read it, so the gradient cannot drift from what
 * the points render. Cached on the ramp's identity.
 */
const rampSteps = (ramp: readonly RGB[]): Uint8Array => {
  if (ramp === cachedRamp && cachedSteps) return cachedSteps;

  const steps = new Uint8Array(RAMP_STEPS * 3);
  const last = ramp.length - 1;
  for (let i = 0; i < RAMP_STEPS; i++) {
    const at = (i / (RAMP_STEPS - 1)) * last;
    const lo = Math.floor(at);
    const hi = Math.min(last, lo + 1);
    const fraction = at - lo;
    for (let channel = 0; channel < 3; channel++) {
      steps[i * 3 + channel] = Math.round(
        ramp[lo][channel] + fraction * (ramp[hi][channel] - ramp[lo][channel]),
      );
    }
  }

  cachedRamp = ramp;
  cachedSteps = steps;
  return steps;
};

const stepAt = (t: number) =>
  Math.round(Math.min(1, Math.max(0, t)) * (RAMP_STEPS - 1)) * 3;

/** The CSS color at position t ∈ [0, 1] on the continuous ramp */
export const rampCss = (palette: PlotPalette, t: number): string => {
  const steps = rampSteps(palette.ramp);
  const at = stepAt(t);
  return `rgb(${steps[at]}, ${steps[at + 1]}, ${steps[at + 2]})`;
};

/** Expands a color column into Float32Array(n*3) rgb for the renderer */
export function buildColors(
  column: ColorValues,
  palette: PlotPalette,
  range?: { min: number | null; max: number | null },
): Float32Array {
  if (column.style === "categorical") {
    const { indices } = column;
    const classes = palette.classes.map((css) => toUnitRgb(css) ?? MISSING_RGB);
    const colors = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      // MISSING_CATEGORY indexes past every class list
      colors.set(classes[indices[i]] ?? MISSING_RGB, i * 3);
    }
    return colors;
  }

  const { values } = column;
  const steps = rampSteps(palette.ramp);
  const lo = range?.min ?? 0;
  const hi = range?.max ?? 1;
  const span = hi - lo || 1;
  const colors = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (Number.isNaN(value)) {
      colors.set(MISSING_RGB, i * 3);
      continue;
    }
    const at = stepAt((value - lo) / span);
    colors[i * 3] = steps[at] / 255;
    colors[i * 3 + 1] = steps[at + 1] / 255;
    colors[i * 3 + 2] = steps[at + 2] / 255;
  }
  return colors;
}
