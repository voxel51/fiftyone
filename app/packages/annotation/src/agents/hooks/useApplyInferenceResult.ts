import {
  AgentTaskType,
  InferenceResult,
  InferenceResultProxy,
  SegmentationInferenceResult,
} from "../types";
import { useCallback } from "react";
import { useLighter } from "@fiftyone/lighter";
import { DetectionAnnotationLabel } from "@fiftyone/state";

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
 *
 * @param createDetection Callback which creates a new detection overlay
 */
export const useApplyInferenceResult = (
  createDetection: () => DetectionAnnotationLabel | null
): InferenceResultHandler => {
  const { getOverlay, scene } = useLighter();

  return useCallback(
    (result: InferenceResult<InferenceResultProxy>) => {
      if (result.type === "sync") {
        if (result.taskType === AgentTaskType.SEGMENT) {
          if (scene) {
            const inferenceData =
              result.response as SegmentationInferenceResult;

            let overlay = getOverlay(result.labelId);
            if (!overlay) {
              // if there is no overlay yet, this is a new label
              overlay = createDetection()?.overlay;
            }

            if (overlay) {
              const newLabelData = {
                ...overlay.label,
                // accept new bounding box and mask from inference result
                bounding_box: inferenceData.detections?.[0]?.bounding_box,
                mask: inferenceData.detections?.[0]?.mask,
              };

              // todo integrate with undo/redo
              overlay.updateLabel(newLabelData);
            } else {
              console.warn("Unable to create overlay");
            }
          }
        } else {
          console.warn(`Unsupported task type: ${result.taskType}`);
        }
      } else {
        console.warn(`Unsupported result type: ${result.type}`);
      }
    },
    [createDetection, getOverlay, scene]
  );
};
