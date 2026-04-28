import {
  AgentTaskType,
  InferenceResult,
  InferenceResultProxy,
  SegmentationInferenceResult,
} from "../types";
import { useCallback } from "react";
import { useLighter } from "@fiftyone/lighter";
import { DetectionAnnotationLabel } from "@fiftyone/state";
import { currentData } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { useSetAtom } from "jotai";

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
  const setCurrentData = useSetAtom(currentData);

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

              // Sync the mask and bounding box into the sidebar's annotation
              // for mask preview
              setCurrentData({
                bounding_box: newLabelData.bounding_box,
                mask: newLabelData.mask,
              });
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
    [createDetection, getOverlay, scene, setCurrentData]
  );
};
