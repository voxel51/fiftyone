import {
  FO_LABEL_HOVERED_EVENT,
  FO_LABEL_TOGGLED_EVENT,
  FO_LABEL_UNHOVERED_EVENT,
  LabelData,
  LabelHoveredEvent,
  LabelToggledEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import { useOnShiftClickLabel } from "@fiftyone/state/src/hooks/useOnShiftClickLabel";
import {
  hoveredInstances,
  jotaiStore,
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

export const useOnShiftClickLabel3d = (
  sampleId: string,
  labels: LabelData[]
) => {
  const getOnShiftClickLabelCallback = useOnShiftClickLabel();

  useEffect(() => {
    console.log("useOnShiftClickLabel3d");
    const unsub = selectiveRenderingEventBus.on(
      FO_LABEL_TOGGLED_EVENT,
      (e: LabelToggledEvent) => {
        getOnShiftClickLabelCallback(sampleId, labels, e);
      }
    );

    return () => {
      unsub();
    };
  }, [sampleId, labels, getOnShiftClickLabelCallback]);
};
