/**
 * The plot's palette and per-point renderer colors for the current
 * color-by field. Reading the App's color scheme atoms (rather than
 * freezing colors when the column is fetched) is what makes the plot
 * follow pool edits, shuffles, and per-value overrides live — recoloring
 * never refetches the column, since neither step here touches the network.
 */
import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  buildColors,
  resolveColorscale,
  resolvePalette,
  type Colorscale,
  type PlotPalette,
} from "./colors";
import type { ColorMeta, ColorValues } from "./protocol";

export function useColorPalette(
  field: string | null,
  values: ColorValues | null,
  meta: ColorMeta | null,
  /** Overrides the value domain continuous colors map through (a diverging
   * ramp centers it on zero — see `rampDomain` in `@fiftyone/utilities`);
   * null maps meta's min..max. */
  domain: readonly [number, number] | null = null,
): {
  palette: PlotPalette;
  colorscale: Colorscale;
  colors: Float32Array | null;
} {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const colorMap = useRecoilValue(fos.colorMap);
  const appScale = useRecoilValue(fos.coloring).scale;

  const palette = useMemo(
    () => resolvePalette(field, meta, colorMap, colorScheme.fields),
    [field, meta, colorMap, colorScheme.fields],
  );

  const colorscale = useMemo(
    () =>
      resolveColorscale(
        field,
        colorScheme.colorscales,
        colorScheme.defaultColorscale,
        appScale,
      ),
    [field, colorScheme.colorscales, colorScheme.defaultColorscale, appScale],
  );

  const colors = useMemo(
    () =>
      values
        ? buildColors(
            values,
            palette,
            {
              min: domain?.[0] ?? meta?.min ?? null,
              max: domain?.[1] ?? meta?.max ?? null,
            },
            colorscale,
          )
        : null,
    [values, meta, domain, palette, colorscale],
  );

  return { palette, colorscale, colors };
}
