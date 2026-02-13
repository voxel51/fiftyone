import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useActivityToast } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import { useLabelsContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { DetectionLabel } from "@fiftyone/looker";
import { usePersistenceEventHandler } from "../persistence/usePersistenceEventHandler";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const { addLabelToSidebar } = useLabelsContext();
  const handlePersistenceRequest = usePersistenceEventHandler();

  useAnnotationEventHandler(
    "annotation:persistenceRequested",
    useCallback(async () => {
      await handlePersistenceRequest();
    }, [handlePersistenceRequest])
  );

  useAnnotationEventHandler(
    "annotation:persistenceInFlight",
    useCallback(() => {
      setConfig({
        iconName: IconName.Spinner,
        message: "Saving changes...",
        variant: Variant.Secondary,
        // allow for slow API calls; keep toast open until call resolves
        timeout: 300_000,
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
    }, [setConfig])
  );

  useAnnotationEventHandler(
    "annotation:persistenceError",
    useCallback(
      ({ error }) => {
        console.error(error);

        setConfig({
          iconName: IconName.Error,
          message: `Error saving changes: ${error}`,
          variant: Variant.Danger,
        });
      },
      [setConfig]
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
