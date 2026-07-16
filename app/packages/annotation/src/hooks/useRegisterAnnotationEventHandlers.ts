import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { INDEFINITE_TOAST_TIMEOUT, useActivityToast } from "@fiftyone/state";
import { useCallback } from "react";
import type { FC } from "react";
import {
  CheckIcon,
  ErrorIcon,
  Spinner,
  Variant,
  type IconProps,
} from "@voxel51/voodo";
import {
  usePersistenceEventHandler,
  usePersistenceRetryController,
} from "../persistence";

// `Spinner` is a standalone voodo component rather than one of the generated
// icon components; cast so it can be used where an icon (`FC<IconProps>`) is
// expected. Its props (`size`, `className`, `style`) are compatible.
const SpinnerIcon = Spinner as FC<IconProps>;

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const handlePersistenceRequest = usePersistenceEventHandler();
  const retryController = usePersistenceRetryController();

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

      // silence notifications when unhealthy
      if (!retryController.isUnhealthy) {
        setConfig({
          icon: SpinnerIcon,
          message: "Saving changes...",
          variant: Variant.Secondary,
          timeout: INDEFINITE_TOAST_TIMEOUT,
        });
      }
    }, [retryController, setConfig]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      setConfig({
        icon: CheckIcon,
        message: "Changes saved successfully",
        variant: Variant.Success,
      });

      retryController.reset();
    }, [retryController, setConfig]),
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        if (retryController.isUnhealthy) {
          setConfig({
            icon: ErrorIcon,
            message:
              "We couldn’t save your work. Please refresh the page and try again.",
            variant: Variant.Danger,
            timeout: INDEFINITE_TOAST_TIMEOUT,
          });
        } else {
          setConfig({
            icon: ErrorIcon,
            message: "Unable to save changes. Please try again.",
            variant: Variant.Danger,
          });
        }
      },
      [retryController.isUnhealthy, setConfig],
    ),
  );
};
