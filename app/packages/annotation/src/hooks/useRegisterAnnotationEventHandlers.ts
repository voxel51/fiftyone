import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { INDEFINITE_TOAST_TIMEOUT, useActivityToast } from "@fiftyone/state";
import { useCallback, useEffect } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import {
  deriveSaveHealth,
  usePersistenceEventHandler,
  usePersistenceRetryController,
  usePublishSaveStatus,
} from "../persistence";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const handlePersistenceRequest = usePersistenceEventHandler();
  const retryController = usePersistenceRetryController();
  const publishSaveStatus = usePublishSaveStatus();

  // mirror the retry controller's health onto the shared save status the
  // indicator reads; the toasts above and this light share one controller
  useEffect(() => {
    publishSaveStatus((prev) => ({
      ...prev,
      health: deriveSaveHealth(retryController),
    }));
  }, [
    publishSaveStatus,
    retryController.canAttempt,
    retryController.isUnhealthy,
  ]);

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(async () => {
      if (retryController.canAttempt) {
        await handlePersistenceRequest();
      }
    }, [handlePersistenceRequest, retryController.canAttempt]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceInFlight",
    useCallback(() => {
      retryController.recordAttempt();
      publishSaveStatus((prev) => ({ ...prev, inFlight: true }));
    }, [publishSaveStatus, retryController]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      publishSaveStatus((prev) => ({
        ...prev,
        inFlight: false,
        lastSavedAt: Date.now(),
      }));
      retryController.reset();
    }, [publishSaveStatus, retryController]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        publishSaveStatus((prev) => ({ ...prev, inFlight: false }));

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
      [publishSaveStatus, retryController.isUnhealthy, setConfig],
    ),
  );
};
