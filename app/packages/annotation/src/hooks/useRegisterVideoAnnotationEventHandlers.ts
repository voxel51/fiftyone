import { useFrameLabelsStream } from "@fiftyone/video-annotation";
import { useCallback } from "react";
import { useAnnotationEventHandler } from "./useAnnotationEventHandler";

/**
 * Video-specific annotation event handlers. Bridges persistence outcomes to the
 * frame-labels stream so dirty/baseline state advances on success and rolls
 * back on failure. Mount alongside {@link useRegisterAnnotationEventHandlers}
 * at the composition root; no-op when the active modal isn't a video sample.
 */
export const useRegisterVideoAnnotationEventHandlers = () => {
  const videoStream = useFrameLabelsStream();

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      videoStream?.commitPending();
    }, [videoStream])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(() => {
      videoStream?.discardPending();
    }, [videoStream])
  );
};
