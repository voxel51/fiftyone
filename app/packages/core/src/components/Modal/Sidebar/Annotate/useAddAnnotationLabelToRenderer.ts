import {
  DetectionOverlay,
  KeypointOverlay,
  useLighter,
} from "@fiftyone/lighter";
import type { AnnotationLabel } from "@fiftyone/state";
import { CLASSIFICATION, DETECTION, KEYPOINT } from "@fiftyone/utilities";
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
      }
    },
    [addOverlay]
  );
};
