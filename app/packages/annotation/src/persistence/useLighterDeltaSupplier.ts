import { type BaseOverlay, useLighter } from "@fiftyone/lighter";
import { isPatchesView } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { buildAnnotationPath } from "../deltas";
import { buildAnnotationLabel } from "./buildAnnotationLabel";
import type { DeltaSupplier } from "./deltaSupplier";
import { useGetLabelDelta } from "./useGetLabelDelta";

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the Lighter annotation context.
 */
export const useLighterDeltaSupplier = (): DeltaSupplier => {
  const { scene } = useLighter();
  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);
  const isPatches = useRecoilValue(isPatchesView);

  return useCallback(() => {
    const overlays = scene?.getAllOverlays() ?? [];
    const allDeltas: ReturnType<typeof getLabelDelta> = [];
    let firstChangedOverlay: BaseOverlay | undefined;

    for (const overlay of overlays) {
      const deltas = getLabelDelta(overlay, overlay.field);
      if (deltas.length > 0) {
        allDeltas.push(...deltas);
        if (!firstChangedOverlay) {
          firstChangedOverlay = overlay;
        }
      }
    }

    // Must include additional metadata for all generated views so the backend can
    // update the source data as well.
    // Note: Only supported for patches views currently
    let metadata;
    if (isPatches && firstChangedOverlay) {
      // Patches views by definition are flattened detections fields so updates
      // will always be single label
      const labelProxy = buildAnnotationLabel(firstChangedOverlay);
      if (labelProxy) {
        metadata = {
          labelId: firstChangedOverlay.id,
          labelPath: buildAnnotationPath(labelProxy, isPatches),
        };
      }
    }

    return { deltas: allDeltas, metadata };
  }, [getLabelDelta, isPatches, scene]);
};
