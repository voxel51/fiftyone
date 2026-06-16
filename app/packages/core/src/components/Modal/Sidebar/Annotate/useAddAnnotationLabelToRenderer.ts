import {
  DetectionOverlay,
  KeypointOverlay,
  PolylineOverlay,
  useLighter,
} from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import {
  CLASSIFICATION,
  DETECTION,
  KEYPOINT,
  POLYLINE,
} from "@fiftyone/utilities";
import { useCallback } from "react";

/**
 * Hook which adds an annotation label to the rendering context.
 */
export const useAddAnnotationLabelToRenderer = () => {
  const { addOverlay } = useLighter();

  return useCallback(
    (label: AnnotationLabel) => {
      if (label.type === CLASSIFICATION) {
        addOverlay(label.overlay);
      } else if (label.type === DETECTION) {
        // 3D detections carry a plain overlay stand-in (rendered by looker-3d),
        // not a Lighter overlay — only real DetectionOverlays go to the scene.
        if (label.overlay instanceof DetectionOverlay) {
          addOverlay(label.overlay);
        }
      } else if (label.type === KEYPOINT) {
        addOverlay(label.overlay as KeypointOverlay);
      } else if (
        label.type === POLYLINE &&
        label.overlay instanceof PolylineOverlay
      ) {
        addOverlay(label.overlay);
      }
    },
    [addOverlay]
  );
};
