import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { useCallback } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Video-specific annotation event handlers. Bridges persistence outcomes to the
 * frame-labels stream so dirty/baseline state advances on success and rolls
 * back on failure. Mount alongside {@link useRegisterAnnotationEventHandlers}
 * at the composition root; no-op when the active modal isn't a video sample.
 *
 * TD edits don't need an explicit roll-back here — they live on the scene's
 * `TemporalOverlay` instances. On success, the sample refetch repopulates
 * the overlays via `useTemporalOverlaySync`. On error, the overlays keep
 * their dirty state so the user can retry without re-doing the edit.
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
