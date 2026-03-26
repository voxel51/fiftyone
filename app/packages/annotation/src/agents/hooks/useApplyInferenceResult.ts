import {
  AgentTaskType,
  InferenceResult,
  InferenceResultProxy,
  SegmentationInferenceResult,
} from "../types";
import { useCallback } from "react";
import { useLighter } from "@fiftyone/lighter";
import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";

/**
 * Method which applies the provided {@link InferenceResult} to the current
 * annotation session.
 */
export type InferenceResultHandler = (
  result: InferenceResult<InferenceResultProxy>
) => void;

/**
 * Hook which returns a {@link InferenceResultHandler} bound to the current
 * annotation session.
 */
export const useApplyInferenceResult = (): InferenceResultHandler => {
  const { selectedLabel } = useAnnotationContext();
  const { getOverlay } = useLighter();

  return useCallback(
    (result: InferenceResult<InferenceResultProxy>) => {
      if (!selectedLabel || !getOverlay) {
        return;
      }

      if (result.type === "sync") {
        if (result.taskType === AgentTaskType.SEGMENT) {
          const inferenceData = result.response as SegmentationInferenceResult;

          const newLabelData = {
            ...selectedLabel.data,
            mask: inferenceData.detections?.[0]?.mask,
          };

          // todo integrate with undo/redo
          getOverlay(selectedLabel.data._id)?.updateLabel(newLabelData);
        } else {
          console.warn(`Unsupported task type: ${result.taskType}`);
        }
      } else {
        // todo async handling
      }
    },
    [getOverlay, selectedLabel]
  );
};
