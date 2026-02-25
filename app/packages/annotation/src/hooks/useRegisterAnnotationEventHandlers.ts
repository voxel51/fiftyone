import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useActivityToast, useRetryController } from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import { useLabelsContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { DetectionLabel } from "@fiftyone/looker";
import { usePersistenceEventHandler } from "../persistence";
import { v4 } from "uuid";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const { addLabelToSidebar } = useLabelsContext();
  const handlePersistenceRequest = usePersistenceEventHandler();
  const {
    canAttempt: canAttemptPersistence,
    registerAttempt: registerFailedAttempt,
    reset: resetRetryController,
  } = useRetryController({
    id: useMemo(() => v4(), []),
    maxAttempts: 3,
  });

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(async () => {
      if (canAttemptPersistence) {
        await handlePersistenceRequest();
      } else {
        setConfig({
          iconName: IconName.Error,
          message:
            "We couldn’t save your work. Please refresh the page and try again.",
          variant: Variant.Danger,
          // keep toast open indefinitely
          timeout: -1,
        });
      }
    }, [canAttemptPersistence, handlePersistenceRequest, setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceInFlight",
    useCallback(() => {
      setConfig({
        iconName: IconName.Spinner,
        message: "Saving changes...",
        variant: Variant.Secondary,
        // keep toast open until call resolves
        timeout: -1,
      });
    }, [setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceSuccess",
    useCallback(() => {
      setConfig({
        iconName: IconName.Check,
        message: "Changes saved successfully",
        variant: Variant.Success,
      });

      resetRetryController();
    }, [resetRetryController, setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        setConfig({
          iconName: IconName.Error,
          message: "Unable to save changes. Please try again.",
          variant: Variant.Danger,
        });

        registerFailedAttempt();
      },
      [registerFailedAttempt, setConfig]
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
