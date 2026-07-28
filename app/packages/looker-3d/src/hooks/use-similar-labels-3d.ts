import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelHoveredEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import {
  jotaiStore,
  removeAllHoveredInstances,
  updateHoveredInstances,
} from "@fiftyone/state/src/jotai";
import { useEffect, useState } from "react";
import { OverlayLabel } from "../labels/loader";

/**
 * Hook to check if a 3D label is similar to another label
 * by checking if the instanceId is the same
 */
export const useSimilarLabels3d = (label: OverlayLabel) => {
  const [isSimilarLabelHovered, setIsSimilarLabelHovered] = useState(false);
  const instanceId = label.instance?._id;
  const sampleId = label.sampleId;
  const labelId = label._id;
  const path = label.path;

  // This effect subscribes to hover events and updates similar-label hover state.
  useEffect(() => {
    if (!instanceId) {
      return;
    }

    const unsubHovering = selectiveRenderingEventBus.on(
      FO_LABEL_HOVERED_EVENT,
      (e: LabelHoveredEvent) => {
        const hoveredInstanceId = e.detail.instanceId;

        if (hoveredInstanceId === instanceId) {
          setIsSimilarLabelHovered(true);
          jotaiStore.set(updateHoveredInstances, {
            sampleId,
            instanceId,
            labelId,
            field: path,
          });
        } else {
          setIsSimilarLabelHovered(false);
        }
      },
    );

    const unsubUnhovering = selectiveRenderingEventBus.on(
      FO_LABEL_UNHOVERED_EVENT,
      () => {
        setIsSimilarLabelHovered(false);
        jotaiStore.set(removeAllHoveredInstances);
      },
    );

    return () => {
      unsubHovering();
      unsubUnhovering();
    };
  }, [instanceId, labelId, path, sampleId]);

  return isSimilarLabelHovered;
};
