/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Heatmap color resolution, mirroring looker's worker painter
 * (`looker/src/worker/painter.ts`, the `Heatmap` branch) so the same map
 * paints identically on both surfaces.
 *
 * The two modes are genuinely different renderings, not two color choices:
 *
 * - by FIELD: one color, with OPACITY proportional to |value| over the range.
 *   `range = [-50, 100]` therefore renders 0 fully transparent, -50 at half
 *   opacity and 100 fully opaque — the asymmetry the original Heatmap PR
 *   (#1229) describes.
 * - by VALUE: full opacity, with the COLOR taken from a colorscale indexed
 *   across the range. Values below the range start are background.
 */

import type { ColorSchemeInput } from "@fiftyone/relay";
import { COLOR_BY, getColor, type RGB } from "@fiftyone/utilities";

export interface HeatmapPalette {
  /** `field` ramps opacity over one color; `value` ramps color over a scale. */
  mode: COLOR_BY.FIELD | COLOR_BY.VALUE;
  /** The single color used in field mode. */
  fieldColor: string;
  /** Colorscale stops for value mode; empty means none resolved. */
  scale: readonly RGB[];
  /**
   * The label's declared `range`, when it has one. Absent means the range is
   * inferred from the array's type at decode time — `[0, 1]` for floats and
   * `[0, 255]` for integers — which is knowable only once the map is decoded.
   */
  range?: readonly [number, number];
}

/**
 * A colorscale as it actually arrives at runtime.
 *
 * `rgb` is a resolver field on the GraphQL Colorscale TYPE, computed
 * server-side from the scale's `name` ("viridis") or `list`. It is absent from
 * the generated *Input* types — which is what `ColorSchemeInput` is built
 * from — so the value is present at runtime but invisible to TypeScript.
 * Looker reads it the same way.
 */
type WithRgb = { rgb?: number[][] | null };

/** The colorscale for a field: its own, else the dataset default. */
const resolveScale = (
  path: string,
  colorScheme: ColorSchemeInput,
): readonly RGB[] => {
  const forField = (colorScheme.colorscales ?? []).find(
    (entry) => entry.path === path,
  ) as ((typeof colorScheme.colorscales)[number] & WithRgb) | undefined;

  const fallback = colorScheme.defaultColorscale as
    | (typeof colorScheme.defaultColorscale & WithRgb)
    | null
    | undefined;

  return (forField?.rgb ?? fallback?.rgb ?? []) as RGB[];
};

export const resolveHeatmapPalette = (
  path: string,
  colorScheme: ColorSchemeInput,
  seed: number,
  range: readonly number[] | null | undefined,
): HeatmapPalette => {
  const setting = (colorScheme.fields ?? []).find(
    (field) => field.path === path,
  );

  const scale = resolveScale(path, colorScheme);

  const requested =
    (colorScheme.colorBy?.toLowerCase() as COLOR_BY | undefined) ??
    COLOR_BY.FIELD;

  // Value mode needs a scale to index. With none resolved, opacity-ramping one
  // color still conveys the data; painting nothing would just look broken.
  const mode =
    requested === COLOR_BY.VALUE && scale.length > 0
      ? COLOR_BY.VALUE
      : COLOR_BY.FIELD;

  return {
    mode,
    fieldColor:
      setting?.fieldColor ?? getColor(colorScheme.colorPool ?? [], seed, path),
    scale,
    range:
      range && range.length === 2
        ? [Number(range[0]), Number(range[1])]
        : undefined,
  };
};

/** Stable key for a palette — a cheap way to know a re-rasterize is needed. */
export const heatmapPaletteKey = (palette: HeatmapPalette): string =>
  JSON.stringify([
    palette.mode,
    palette.fieldColor,
    palette.scale,
    palette.range ?? null,
  ]);
