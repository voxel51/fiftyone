import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelHoveredEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import { jotaiStore, updateHoveredInstances } from "@fiftyone/state/src/jotai";
import { useEffect, useState } from "react";
import { OverlayLabel } from "../labels/loader";

/**
 * Hook to check if a 3D label is similar to another label
 * by checking if the instanceId is the same
 */
export const useSimilarLabels3d = (label: OverlayLabel) => {
  const [isSimilarLabelHovered, setIsSimilarLabelHovered] = useState(false);

  useEffect(() => {
    if (!label.instance?._id) {
      return;
    }

    const unsubHovering = selectiveRenderingEventBus.on(
      FO_LABEL_HOVERED_EVENT,
      (e: LabelHoveredEvent) => {
        const { instanceId } = e.detail;

        if (instanceId === label.instance?._id) {
          setIsSimilarLabelHovered(true);
          jotaiStore.set(updateHoveredInstances, {
            sampleId: label.sampleId,
            instanceId: label.instance?._id,
            labelId: label._id,
            field: label.path,
          });
        } else {
          setIsSimilarLabelHovered(false);
        }
      }
    );

    const unsubUnhovering = selectiveRenderingEventBus.on(
      FO_LABEL_UNHOVERED_EVENT,
      () => {
        setIsSimilarLabelHovered(false);
      }
    );

    return () => {
      unsubHovering();
      unsubUnhovering();
    };
  }, [label]);

  return isSimilarLabelHovered;
};
