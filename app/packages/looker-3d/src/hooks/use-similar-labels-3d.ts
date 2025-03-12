import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelHoveredEvent,
} from "@fiftyone/looker";
import { useEventHandler } from "@fiftyone/state";
import { useState } from "react";
import { OverlayLabel } from "../labels/loader";

/**
 * Hook to check if a 3D label is similar to another label
 * by checking if the instanceId is the same
 */
export const useSimilarLabels3d = (label: OverlayLabel) => {
  const [isSimilarLabelHovered, setIsSimilarLabelHovered] = useState(false);

  useEventHandler(document, FO_LABEL_HOVERED_EVENT, (e: LabelHoveredEvent) => {
    const { instanceId } = e.detail;

    if (instanceId === label.instance_config?._id) {
      setIsSimilarLabelHovered(true);
    }
  });

  useEventHandler(document, FO_LABEL_UNHOVERED_EVENT, () => {
    setIsSimilarLabelHovered(false);
  });

  return isSimilarLabelHovered;
};
