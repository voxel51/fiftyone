import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { gridPatches, type GridPatches } from "./gridPatches";

/**
 * The grid's current patches view, as the label fields a patches run must
 * embed to link to it; null outside patches views. Read from state the
 * page already holds: the view's stages name the patches field, and an
 * evaluation's fields ride on the dataset query.
 */
export function useGridPatches(): GridPatches | null {
  const stages = fos.useView();
  const isPatchesView = fos.useIsPatchesView();
  const evaluations = fos.useCurrentDataset()?.evaluations;

  return useMemo(
    () => gridPatches(stages, isPatchesView, evaluations ?? []),
    [stages, isPatchesView, evaluations],
  );
}
