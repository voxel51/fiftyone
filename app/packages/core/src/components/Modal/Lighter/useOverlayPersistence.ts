/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { OverlayEventDetail, Scene2D } from "@fiftyone/lighter";
import { LIGHTER_EVENTS } from "@fiftyone/lighter";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useCallback, useEffect } from "react";

/**
 * Hook that handles overlay persistence events.
 */
export const useOverlayPersistence = (scene: Scene2D | null) => {
  const addBoundingBox = useOperatorExecutor("add_bounding_box");
  const removeBoundingBox = useOperatorExecutor("remove_bounding_box");

  const handlePersistOverlay = useCallback(
    (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_PERSIST_OVERLAY>
      >
    ) => {
      const overlay = event.detail;

      if (overlay) {
        try {
          const bbox = [
            overlay.bounds.x,
            overlay.bounds.y,
            overlay.bounds.width,
            overlay.bounds.height,
          ];
          addBoundingBox.execute({
            field: overlay.field,
            sample_id: overlay.sampleId,
            label_id: overlay.id,
            label: overlay.label ?? "",
            bounding_box: bbox,
          });
        } catch (error) {
          console.error("Error adding bounding box", error);
        }
      } else {
        console.error(
          "Overlay",
          overlay.constructor.name,
          "not supported for persistence"
        );
      }
    },
    [addBoundingBox]
  );

  const handleRemoveOverlay = useCallback(
    (
      event: CustomEvent<
        OverlayEventDetail<typeof LIGHTER_EVENTS.DO_REMOVE_OVERLAY>
      >
    ) => {
      const { id, sampleId, path } = event.detail;
      try {
        console.log("removing bounding box", id, sampleId, path);
        removeBoundingBox.execute({
          id,
          path,
          sample_id: sampleId,
        });
      } catch (error) {
        console.error("Error removing bounding box", error);
      }
    },
    [removeBoundingBox]
  );

  useEffect(() => {
    if (!scene) {
      return;
    }

    scene.on(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);
    scene.on(LIGHTER_EVENTS.DO_REMOVE_OVERLAY, handleRemoveOverlay);

    return () => {
      scene.off(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);
      scene.off(LIGHTER_EVENTS.DO_REMOVE_OVERLAY, handleRemoveOverlay);
    };
  }, [handlePersistOverlay, handleRemoveOverlay, scene]);
};
