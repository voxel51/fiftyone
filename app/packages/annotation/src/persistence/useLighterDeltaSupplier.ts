import type { DeltaSupplier } from "./deltaSupplier";
import {
  type BaseOverlay,
  BoundingBoxOverlay,
  ClassificationOverlay,
  useLighter,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import type { JSONDeltas } from "@fiftyone/core";
import type { DetectionLabel } from "@fiftyone/looker";
import type { ClassificationLabel } from "@fiftyone/looker/src/overlays/classifications";
import { useGetLabelDelta } from "./useGetLabelDelta";
import type { LabelProxy } from "../deltas";
import { hasValidBounds } from "@fiftyone/utilities";
import { BoundingBox } from "@fiftyone/looker/src/state";
import { getDefaultStore } from "jotai";
import {
  pendingDeletionsAtom,
  type PendingDeletion,
} from "./pendingDeletions";

const STORE = getDefaultStore();

/**
 * Build a {@link LabelProxy} instance from a reconciled 3d label.
 *
 * @param overlay Lighter overlay
 */
const buildAnnotationLabel = (overlay: BaseOverlay): LabelProxy | undefined => {
  if (overlay instanceof BoundingBoxOverlay && overlay.label.label) {
    const bounds = overlay.getRelativeBounds();
    const boundingBox: BoundingBox = [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    ];

    if (hasValidBounds(boundingBox)) {
      return {
        type: "Detection",
        data: overlay.label as DetectionLabel,
        boundingBox,
        path: overlay.field,
      };
    }
  } else if (overlay instanceof ClassificationOverlay && overlay.label.label) {
    return {
      type: "Classification",
      data: overlay.label as ClassificationLabel,
      path: overlay.field,
    };
  }
};

/**
 * Build a {@link LabelProxy} from a {@link PendingDeletion}.
 */
const buildDeletionLabel = (deletion: PendingDeletion): LabelProxy => ({
  type: deletion.type as "Detection" | "Classification",
  data: deletion.data,
  path: deletion.path,
});

/**
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the Lighter annotation context.
 */
export const useLighterDeltaSupplier = (): DeltaSupplier => {
  const { scene } = useLighter();
  const getLabelDelta = useGetLabelDelta(buildAnnotationLabel);
  const getDeleteDelta = useGetLabelDelta(buildDeletionLabel, {
    opType: "delete",
  });

  return useCallback(() => {
    const sampleDeltas: JSONDeltas = [];

    scene?.getAllOverlays()?.forEach((overlay) => {
      sampleDeltas.push(...getLabelDelta(overlay, overlay.field));
    });

    // Generate deletion deltas for labels removed via undo.
    const deletions = STORE.get(pendingDeletionsAtom);
    if (deletions.length > 0) {
      const currentOverlayIds = new Set(
        scene?.getAllOverlays()?.map((o) => o.id) ?? []
      );

      for (const deletion of deletions) {
        // Skip if the overlay was re-added (e.g. via redo).
        if (!currentOverlayIds.has(deletion.data._id)) {
          sampleDeltas.push(...getDeleteDelta(deletion, deletion.path));
        }
      }

      STORE.set(pendingDeletionsAtom, []);
    }

    return sampleDeltas;
  }, [getLabelDelta, getDeleteDelta, scene]);
};
