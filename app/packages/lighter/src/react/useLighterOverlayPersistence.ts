/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { useCallback, useEffect } from "react";
import { LIGHTER_EVENTS, Scene2D } from "../index";
import { BoundingBoxPersistence } from "../types";

/**
 * Hook that handles tooltip events for lighter overlays.
 * Converts lighter hover events to tooltip state updates.
 */
export const useLighterOverlayPersistence = (scene: Scene2D | null) => {
  const addBoundingBox = useOperatorExecutor("add_bounding_box");

  const handlePersistOverlay = useCallback(
    (event: CustomEvent) => {
      const overlay = event.detail;

      if (overlay instanceof BoundingBoxPersistence) {
        try {
          const bbox = [
            overlay.bounds.x,
            overlay.bounds.y,
            overlay.bounds.width,
            overlay.bounds.height,
          ];
          addBoundingBox.execute({
            path: overlay.path,
            field: overlay.field,
            sample_id: overlay.sampleId,
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

  // TODO
  const handleOverlayRemoved = useCallback(() => {}, []);

  useEffect(() => {
    if (!scene) {
      return;
    }

    scene.on(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);

    return () => {
      scene.off(LIGHTER_EVENTS.DO_PERSIST_OVERLAY, handlePersistOverlay);
    };
  }, [scene]);
};
