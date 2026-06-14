import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { INDEFINITE_TOAST_TIMEOUT, useActivityToast } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import { useLabelsContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { DetectionLabel } from "@fiftyone/looker";
import {
  usePersistenceEventHandler,
  usePersistenceRetryController,
} from "../persistence";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const { addLabelToSidebar } = useLabelsContext();
  const handlePersistenceRequest = usePersistenceEventHandler();
  const retryController = usePersistenceRetryController();

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(async () => {
      if (retryController.canAttempt) {
        await handlePersistenceRequest();
      }
    }, [handlePersistenceRequest, retryController.canAttempt])
  );

  useAnnotationEventHandler(
    "annotation:persistenceInFlight",
    useCallback(() => {
      retryController.recordAttempt();

      // silence notifications when unhealthy
      if (!retryController.isUnhealthy) {
        setConfig({
          iconName: IconName.Spinner,
          message: "Saving changes...",
          variant: Variant.Secondary,
          timeout: INDEFINITE_TOAST_TIMEOUT,
        });
      }
    }, [retryController, setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      setConfig({
        iconName: IconName.Check,
        message: "Changes saved successfully",
        variant: Variant.Success,
      });

      retryController.reset();
    }, [retryController, setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        if (retryController.isUnhealthy) {
          setConfig({
            iconName: IconName.Error,
            message:
              "We couldn’t save your work. Please refresh the page and try again.",
            variant: Variant.Danger,
            timeout: INDEFINITE_TOAST_TIMEOUT,
          });
        }
      },
      [retryController.isUnhealthy, setConfig]
    )
  );

  useAnnotationEventHandler(
    "annotation:canvasDetectionOverlayEstablish",
    useCallback(
      (payload) => {
        addLabelToSidebar({
          data: payload.overlay.label as DetectionLabel,
          overlay: payload.overlay,
          path: payload.overlay.field,
          type: "Detection",
        });
      },
      [addLabelToSidebar]
    )
  );
};
