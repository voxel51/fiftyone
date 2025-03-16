import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelData,
  LabelHoveredEvent,
} from "@fiftyone/looker";
import { useEventHandler } from "@fiftyone/state";
import { useOnShiftClickLabel } from "@fiftyone/state/src/hooks/useOnShiftClickLabel";
import { jotaiStore, updateHoveredInstances } from "@fiftyone/state/src/jotai";
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

      // add to jotai store
      jotaiStore.set(updateHoveredInstances, {
        instanceId,
        field: label.path,
        labelId: label._id,
      });
    }
  });

  useEventHandler(document, FO_LABEL_UNHOVERED_EVENT, () => {
    setIsSimilarLabelHovered(false);
  });

  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  return isSimilarLabelHovered;
};

export const useOnShiftClickLabel3d = (
  sampleId: string,
  labels: LabelData[]
) => {
  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  useEventHandler(document, "newLabelToggled", (e) =>
    getOnShiftClickLabelCallback(sampleId, labels, e)
  );
};
