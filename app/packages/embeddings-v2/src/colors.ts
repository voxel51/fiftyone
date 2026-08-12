/**
 * Maps v2 color columns to the renderer's flat rgb triplets. Both the
 * categorical palette and the continuous colorscale come from the App's
 * color scheme, so neither can drift from the grid.
 */
import { getRGB, type RGB } from "@fiftyone/utilities";
import { CSS_COLOR_NAMES } from "./cssColorNames";
import type { ColorMeta, ColorValues } from "./protocol";

export const MISSING_CATEGORY = 0xffff;

/** CSS color per categorical value, aligned to the field's `classes` */
export type PlotPalette = readonly string[];

/** A resolved continuous colorscale: dense RGB stops, evenly spaced over
 * [0, 1] — the same shape the App's own colorscale fields already carry
 * (server-precomputed, not raw named stops), so no re-discretizing here. */
export type Colorscale = readonly RGB[];

const MISSING_CSS = "#737373";
// Fallback when no colorscale resolves anywhere (cool blue -> Voxel51 orange)
const DEFAULT_COLORSCALE: Colorscale = [
  [0.15, 0.4, 0.9],
  [1.0, 0.65, 0.0],
];

/** The label attribute the grid colors by when a field configures none */
const DEFAULT_ATTRIBUTE = "label";

const toUnitRgb = (css: string | null | undefined): RGB | null => {
  if (typeof css !== "string") return null;
  const named = CSS_COLOR_NAMES[css.toLowerCase()];
  const rgb = getRGB(named ?? css);
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
 * while the grid colors by that same attribute. A patches plot's path has
 * an extra list segment (`ground_truth.detections.label`) between the
 * scheme's entry (`ground_truth`) and the attribute, so every dotted
 * prefix is tried, longest first, not just the immediate parent.
 */
const valueColorsFor = (
  fields: readonly FieldSetting[] | null | undefined,
  path: string,
): Map<string, string> => {
  const segments = path.split(".");
  const attribute = segments.at(-1);
  let setting = fields?.find((field) => field.path === path);
  for (let i = segments.length - 1; !setting && i > 0; i--) {
    const prefix = segments.slice(0, i).join(".");
    setting = fields?.find(
      (field) =>
        field.path === prefix &&
        (field.colorByAttribute ?? DEFAULT_ATTRIBUTE) === attribute,
    );
  }

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

interface ColorscaleSetting {
  path?: string | null;
  /** Server-precomputed dense stops, 0-255 integer per channel (kept loose:
   * callers pass the generated Relay colorscale-fragment shape, not this
   * local type). */
  rgb?: unknown;
}

/** Normalizes a raw 0-255 integer RGB stop list (the wire format both the
 * scheme's colorscales and the app config's fallback use) to the 0-1 float
 * range every other color in this file works in. Returns null for anything
 * that isn't a non-empty array of 3-plus-number tuples. */
function normalizeColorscale(raw: unknown): Colorscale | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const stops: RGB[] = [];
  for (const stop of raw) {
    if (!Array.isArray(stop) || stop.length < 3) return null;
    const [r, g, b] = stop;
    if (![r, g, b].every((channel) => Number.isFinite(channel))) return null;
    stops.push([r / 255, g / 255, b / 255]);
  }
  return stops;
}

/**
 * The continuous colorscale for a color-by field: a field-specific entry
 * from the scheme, then the scheme's default — the entries the grid's own
 * heatmap overlays read, so a configured field means the plot and the grid
 * agree on which colorscale describes it. NOT the app config's scale: that
 * is a synthetic default (canonical viridis), not a user's choice, and its
 * near-black low end vanishes against the plot's dark canvas — an
 * unconfigured field gets the plot's own bright default instead.
 *
 * Every parameter is accepted as `unknown`: the App's own Session type for
 * `fos.colorScheme` is declared against the mutation INPUT shape (which
 * omits the server-computed `rgb` field), narrower than what the read
 * fragment actually returns — so callers pass the live Recoil values
 * straight through rather than fighting that gap here.
 */
export function resolveColorscale(
  field: string | null,
  colorscales: unknown,
  defaultColorscale: unknown,
): Colorscale {
  const scales = colorscales as readonly ColorscaleSetting[] | null | undefined;
  const fieldEntry = field
    ? scales?.find((entry) => entry.path === field)
    : null;
  const defaultEntry = defaultColorscale as ColorscaleSetting | null;
  const resolved =
    normalizeColorscale(fieldEntry?.rgb) ??
    normalizeColorscale(defaultEntry?.rgb);
  return resolved ?? DEFAULT_COLORSCALE;
}

/** The RGB at position t ∈ [0, 1] in a resolved colorscale, interpolated
 * between the two straddling stops. On the server's dense arrays this is
 * indistinguishable from the grid's nearest-stop reads; on a sparse entry
 * (a fresh ramp pick, the built-in default) nearest-stop would band the
 * whole plot into a handful of flat colors. */
function colorscaleRgbAt(colorscale: Colorscale, t: number): RGB {
  if (colorscale.length === 0) colorscale = DEFAULT_COLORSCALE;
  if (colorscale.length === 1) return colorscale[0];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (colorscale.length - 1);
  const i = Math.min(colorscale.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = colorscale[i];
  const b = colorscale[i + 1];
  return [
    a[0] + f * (b[0] - a[0]),
    a[1] + f * (b[1] - a[1]),
    a[2] + f * (b[2] - a[2]),
  ];
}

/**
 * The CSS color at position t ∈ [0, 1] on a resolved colorscale — the
 * same lookup buildColors applies (including its float32 quantization),
 * so a legend gradient built from this cannot drift from the point colors.
 */
export const rampCss = (
  t: number,
  colorscale: Colorscale = DEFAULT_COLORSCALE,
): string => {
  const rgb = colorscaleRgbAt(colorscale, t);
  const at = (channel: number) => Math.round(Math.fround(rgb[channel]) * 255);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
};

/** Expands a color column into Float32Array(n*3) rgb for the renderer */
export function buildColors(
  column: ColorValues,
  palette: PlotPalette,
  range?: { min: number | null; max: number | null },
  colorscale: Colorscale = DEFAULT_COLORSCALE,
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
    colors.set(colorscaleRgbAt(colorscale, t), i * 3);
  }
  return colors;
}
