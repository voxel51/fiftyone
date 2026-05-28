import {
  useClearTemporalDetectionEdits,
  useFrameLabelsStream,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import { useAnnotationEventHandler } from "./useAnnotationEventHandler";

/**
 * Video-specific annotation event handlers. Bridges persistence outcomes to the
 * frame-labels stream so dirty/baseline state advances on success and rolls
 * back on failure, and clears any staged `TemporalDetection.support` edits
 * after a save attempt resolves. Mount alongside
 * {@link useRegisterAnnotationEventHandlers} at the composition root; no-op
 * when the active modal isn't a video sample.
 *
 * TD edits are cleared on both success and error: success means the sample
 * is refreshing with the patched value, so the optimistic override becomes
 * redundant; error rolls back the optimistic visual to whatever the live
 * sample reflects and lets the user retry by re-dragging.
 */
export const useRegisterVideoAnnotationEventHandlers = () => {
  const videoStream = useFrameLabelsStream();
  const clearTemporalDetectionEdits = useClearTemporalDetectionEdits();

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      videoStream?.commitPending();
      clearTemporalDetectionEdits();
    }, [videoStream, clearTemporalDetectionEdits])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(() => {
      videoStream?.discardPending();
      clearTemporalDetectionEdits();
    }, [videoStream, clearTemporalDetectionEdits])
  );
};
