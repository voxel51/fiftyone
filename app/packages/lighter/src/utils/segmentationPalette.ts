/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Segmentation color resolution, mirroring the rules in looker's worker
 * painter (`looker/src/worker/painter.ts`, the `Segmentation` branch) so the
 * same mask paints identically on both surfaces.
 *
 * Kept pure and separate from the rasterizer: the palette is small and cheap
 * to recompute on a color-scheme change, and deriving it on the main thread
 * means the worker is handed concrete colors rather than the whole color
 * scheme.
 */

import type { MaskTargets } from "@fiftyone/looker/src/state";
import { isRgbMaskTargets } from "@fiftyone/looker/src/overlays/util";
import type { ColorSchemeInput } from "@fiftyone/relay";
import { COLOR_BY, getColor } from "@fiftyone/utilities";

export type { MaskTargets };

/**
 * Concrete colors for one segmentation field, everything resolved: the
 * rasterizer does lookups only.
 */
export interface SegmentationPalette {
  /**
   * One color for every target. Set when coloring by field, and also when the
   * field has exactly one mask target — a single-target mask carries no
   * distinction worth coloring by, so it reads as field-colored either way.
   */
  uniformColor?: string;
  /**
   * The field's own color, resolved in every mode. `uniformColor` is unset
   * when coloring by value, but the selection outline still needs one color
   * to draw the whole mask in.
   */
  fieldColor: string;
  /** Explicit per-target colors, from `maskTargetsColors` settings. */
  targetColors: Record<number, string>;
  /** Targets that may paint. Empty means "no restriction". */
  allowedTargets: ReadonlySet<number>;
  /** Fallback ramp, indexed by `target % pool.length`. */
  pool: readonly string[];
  seed: number;
  /**
   * The field's mask targets as the dataset declares them, RGB-keyed or not.
   * Not a color input — the palette above has already read them — but the
   * on-disk decoder needs the raw map to know whether a PNG's channels are
   * addresses (RGB targets) or one index per pixel.
   */
  maskTargets?: MaskTargets;
}

/** `[{ intTarget, color }]` -> `{ [intTarget]: color }`. */
const byTarget = (
  colors: readonly { intTarget: number; color: string }[] | null | undefined,
): Record<number, string> => {
  const out: Record<number, string> = {};

  for (const entry of colors ?? []) {
    out[entry.intTarget] = entry.color;
  }

  return out;
};

/**
 * Resolve the palette for one segmentation field.
 *
 * @param path - The label's field path (`frames.segmentation`).
 * @param colorScheme - The session color scheme.
 * @param seed - The session color seed.
 * @param maskTargets - This field's mask targets, already resolved against the
 *   dataset default by the caller. Empty means every target paints, colored
 *   from the pool.
 */
export const resolveSegmentationPalette = (
  path: string,
  colorScheme: ColorSchemeInput,
  seed: number,
  maskTargets: MaskTargets | undefined,
): SegmentationPalette => {
  const setting = (colorScheme.fields ?? []).find(
    (field) => field.path === path,
  );

  // RGB-keyed mask targets address pixels by hex color, which says nothing
  // about the integer targets of a single-channel mask — the only kind this
  // surface rasterizes. Treating those keys as target indices would filter
  // every pixel out and paint a blank sheet, so read them as "no restriction"
  // instead and let the ramp color the mask.
  const indexed =
    maskTargets && !isRgbMaskTargets(maskTargets) ? maskTargets : undefined;

  const targetKeys = Object.keys(indexed ?? {});

  // Targets outside the map do not paint — but only when the map says
  // something. An empty map is "no opinion", not "nothing is allowed".
  const allowedTargets = new Set(
    targetKeys.map((key) => Number(key)).filter((key) => Number.isFinite(key)),
  );

  const colorBy =
    (colorScheme.colorBy?.toLowerCase() as COLOR_BY | undefined) ??
    COLOR_BY.FIELD;

  const pool = colorScheme.colorPool ?? [];

  const fieldColor = setting?.fieldColor ?? getColor(pool, seed, path);

  // A single-target mask carries no distinction worth coloring by value, so
  // it paints as one field-colored region in either mode.
  const uniform =
    colorBy === COLOR_BY.FIELD || targetKeys.length === 1
      ? fieldColor
      : undefined;

  return {
    uniformColor: uniform,
    fieldColor,
    // field settings win over the dataset-wide defaults
    targetColors: {
      ...byTarget(colorScheme.defaultMaskTargetsColors),
      ...byTarget(setting?.maskTargetsColors),
    },
    allowedTargets,
    pool,
    seed,
    maskTargets,
  };
};

/**
 * The color one target paints, or `undefined` for "do not paint".
 *
 * Target 0 is background and never paints — the one rule that holds in every
 * mode, and the one most easily lost, since a mask whose background is painted
 * hides the media entirely.
 */
export const colorForTarget = (
  target: number,
  palette: SegmentationPalette,
): string | undefined => {
  if (target === 0) {
    return undefined;
  }

  if (palette.allowedTargets.size > 0 && !palette.allowedTargets.has(target)) {
    return undefined;
  }

  if (palette.uniformColor) {
    return palette.uniformColor;
  }

  return palette.targetColors[target] ?? rampColor(target, palette);
};

/**
 * The fallback ramp color for a target.
 *
 * Looker precomputes `coloring.targets[i] = getColor(pool, seed, i)` for
 * `i < pool.length` and indexes it by `target % pool.length`. `getColor`
 * HASHES its argument, so calling it with the raw target instead of the
 * wrapped index yields a different color — the same mask would paint one way
 * in the grid and another here, with nothing to point at. Wrap first.
 */
const rampColor = (target: number, palette: SegmentationPalette): string => {
  const index = Math.round(Math.abs(target));
  const { pool, seed } = palette;

  // An empty pool means `getColor` substitutes its own default pool, so there
  // is no length to wrap against; hand it the index and let it decide.
  return pool.length > 0
    ? getColor(pool, seed, index % pool.length)
    : getColor(pool, seed, index);
};

/** Stable key for a palette — a cheap way to know a re-rasterize is needed. */
export const paletteKey = (palette: SegmentationPalette): string =>
  JSON.stringify([
    palette.uniformColor ?? null,
    palette.fieldColor,
    palette.targetColors,
    [...palette.allowedTargets].sort((a, b) => a - b),
    palette.pool,
    palette.seed,
  ]);
