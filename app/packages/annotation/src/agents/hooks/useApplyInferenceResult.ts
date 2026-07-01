import {
  AgentTaskType,
  InferenceResult,
  InferenceResultProxy,
  SegmentationInferenceResult,
} from "../types";
import { useCallback } from "react";
import {
  type DetectionLabel,
  DetectionOverlay,
  InteractiveDetectionHandler,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
} from "@fiftyone/lighter";
import { DetectionAnnotationLabel } from "@fiftyone/state";

/**
 * Method which applies the provided {@link InferenceResult} to the current
 * annotation session.
 */
export type InferenceResultHandler = (
  result: InferenceResult<InferenceResultProxy>,
) => void;

/**
 * Hook which returns a {@link InferenceResultHandler} bound to the current
 * annotation session.
 *
 * @param createDetection Callback which creates a new detection overlay
 */
export const useApplyInferenceResult = (
  createDetection: () => DetectionAnnotationLabel | null,
): InferenceResultHandler => {
  const { getOverlay, scene } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID,
  );

  return useCallback(
    (result: InferenceResult<InferenceResultProxy>) => {
      if (result.type === "sync") {
        if (result.taskType === AgentTaskType.SEGMENT) {
          if (scene) {
            const inferenceData =
              result.response as SegmentationInferenceResult;

            let overlay = getOverlay(result.labelId);
            const existed = !!overlay;
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

              if (!existed && overlay instanceof DetectionOverlay) {
                // A new inference label: drive it through the same establish a
                // finished brush/pen gesture fires, so the engine bridge commits
                // + selects it (anchoring the form to the frame-bearing ref) and
                // the video surface auto-extends the track — none of which a bare
                // `updateLabel` triggers.
                //
                // Coalesce to ONE undo unit. `updateLabel` commits up front (its
                // own unit) BEFORE establish mints the gesture key the extend
                // folds into. So instead: `applyLabel` sets the pixels WITHOUT
                // committing; establish commits and mints+retains the key (the
                // overlay already carries its mask); the trailing `updateLabel`
                // commit then consumes that retained key. Create + extend share
                // one unit, and the key isn't left dangling.
                //
                // handler/bounds are unused on engine-owned surfaces (Scene2D
                // defers undo to the bridge); they satisfy the event contract and
                // the AddOverlayCommand on any non-engine surface.
                overlay.applyLabel(newLabelData as unknown as DetectionLabel);

                const bounds = overlay.bounds;
                eventBus.dispatch("lighter:overlay-establish", {
                  id: overlay.id,
                  overlayId: overlay.id,
                  handler: new InteractiveDetectionHandler(overlay),
                  startBounds: bounds,
                  startPosition: { x: bounds.x, y: bounds.y },
                  bounds,
                });
              }

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
<<<<<<< HEAD
    [createDetection, getOverlay, scene],
=======
    [createDetection, eventBus, getOverlay, scene],
>>>>>>> main
  );
};
