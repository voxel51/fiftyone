/**
 * Maps v2 color columns to the renderer's flat rgb triplets. The
 * categorical palette comes from the App's color scheme, so it cannot
 * drift from the grid; the continuous ramp is still a placeholder
 * pending integration with the App's colorscales.
 */
import { getRGB, type RGB } from "@fiftyone/utilities";
import type { ColorMeta, ColorValues } from "./protocol";

export const MISSING_CATEGORY = 0xffff;

/** CSS color per categorical value, aligned to the field's `classes` */
export type PlotPalette = readonly string[];

const MISSING_CSS = "#737373";
// Continuous ramp endpoints (cool blue -> Voxel51 orange)
const RAMP_LO: RGB = [0.15, 0.4, 0.9];
const RAMP_HI: RGB = [1.0, 0.65, 0.0];

/** The label attribute the grid colors by when a field configures none */
const DEFAULT_ATTRIBUTE = "label";

const toUnitRgb = (css: string | null | undefined): RGB | null => {
  if (typeof css !== "string") return null;
  const rgb = getRGB(css);
  if (!rgb.every((channel) => Number.isFinite(channel))) return null;
  return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
};

const MISSING_RGB = toUnitRgb(MISSING_CSS) as RGB;

interface FieldSetting {
  path?: string | null;
  colorByAttribute?: string | null;
  valueColors?: readonly { value: string; color: string }[] | null;
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
 * A color for every distinct value of a color-by field. Values resolve
 * by VALUE — a plot colored by field would be one flat color — through
 * the same seeded pool generator and per-value overrides the grid uses,
 * so a point matches its label in the grid whenever the grid colors by
 * value.
 */
export function resolvePalette(
  field: string | null,
  meta: ColorMeta | null,
  /** The App's seeded pool generator (`fos.colorMap`) */
  colorMap: (value: string) => string,
  fields?: readonly FieldSetting[] | null,
): PlotPalette {
  if (meta?.style !== "categorical") return [];
  const overrides = field ? valueColorsFor(fields, field) : new Map();

  return (meta.classes ?? []).map(({ label }) => {
    const value = String(label);
    const custom = overrides.get(value);
    // An override the renderer cannot parse falls back to the pool, not
    // to gray — a bad color must not erase the value
    return toUnitRgb(custom) ? (custom as string) : colorMap(value);
  });
}

/**
 * The CSS color a categorical value's index maps to. The single source
 * for legend swatches and hover swatches, so they cannot drift from the
 * point colors buildColors assigns.
 */
export const categoryCss = (palette: PlotPalette, index: number): string =>
  palette[index] ?? MISSING_CSS;

/**
 * The CSS color at position t ∈ [0, 1] on the continuous ramp — the
 * same per-channel interpolation buildColors applies (including its
 * float32 quantization), so a legend gradient built from this cannot
 * drift from the point colors.
 */
export const rampCss = (t: number): string => {
  const at = (channel: number) =>
    Math.round(
      Math.fround(
        RAMP_LO[channel] + t * (RAMP_HI[channel] - RAMP_LO[channel]),
      ) * 255,
    );
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
};

/** Expands a color column into Float32Array(n*3) rgb for the renderer */
export function buildColors(
  column: ColorValues,
  palette: PlotPalette,
  range?: { min: number | null; max: number | null },
): Float32Array {
  if (column.style === "categorical") {
    const { indices } = column;
    const rgb = palette.map((css) => toUnitRgb(css) ?? MISSING_RGB);
    const colors = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      // MISSING_CATEGORY indexes past every palette entry
      colors.set(rgb[indices[i]] ?? MISSING_RGB, i * 3);
    }
    return colors;
  }

  const { values } = column;
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
    const t = Math.min(1, Math.max(0, (value - lo) / span));
    colors[i * 3] = RAMP_LO[0] + t * (RAMP_HI[0] - RAMP_LO[0]);
    colors[i * 3 + 1] = RAMP_LO[1] + t * (RAMP_HI[1] - RAMP_LO[1]);
    colors[i * 3 + 2] = RAMP_LO[2] + t * (RAMP_HI[2] - RAMP_LO[2]);
  }
  return colors;
}
