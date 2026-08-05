/**
 * Bridges the App's color scheme into the plot's palette. Reading the
 * scheme's atoms (rather than a color column the server colored) is what
 * makes the plot follow pool edits, shuffles, and per-value overrides
 * live — see resolvePalette for how a class becomes a color.
 */
import * as fos from "@fiftyone/state";
import type { RGB } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { resolvePalette, type PlotPalette } from "./colors";
import type { ColorMeta } from "./protocol";

export function useSchemePalette(
  field: string | null,
  meta: ColorMeta | null,
): PlotPalette {
  const colorScheme = useRecoilValue(fos.colorScheme);
  const colorMap = useRecoilValue(fos.colorMap);
  const configColorscale = useRecoilValue(fos.configData)?.colorscale as
    | RGB[]
    | null;

  return useMemo(
    () =>
      resolvePalette({
        field,
        meta,
        colorMap,
        fields: colorScheme.fields,
        colorscales: colorScheme.colorscales,
        defaultColorscale: colorScheme.defaultColorscale,
        configColorscale,
      }),
    [field, meta, colorMap, colorScheme, configColorscale],
  );
}
