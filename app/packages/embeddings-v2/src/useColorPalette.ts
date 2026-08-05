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
import { buildColors, resolvePalette, type PlotPalette } from "./colors";
import type { ColorMeta, ColorValues } from "./protocol";

export function useColorPalette(
  field: string | null,
  values: ColorValues | null,
  meta: ColorMeta | null,
): { palette: PlotPalette; colors: Float32Array | null } {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const colorMap = useRecoilValue(fos.colorMap);

  const palette = useMemo(
    () => resolvePalette(field, meta, colorMap, colorScheme.fields),
    [field, meta, colorMap, colorScheme.fields],
  );

  const colors = useMemo(
    () =>
      values
        ? buildColors(values, palette, {
            min: meta?.min ?? null,
            max: meta?.max ?? null,
          })
        : null,
    [values, meta, palette],
  );

  return { palette, colors };
}
