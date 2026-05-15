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
        addOverlay(label.overlay as DetectionOverlay);
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
