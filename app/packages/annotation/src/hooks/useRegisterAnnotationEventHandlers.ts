import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useAnnotationEventBus } from "./useAnnotationEventBus";
import { useActivityToast } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import { useLabelsContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { usePersistenceEventHandler } from "../persistence/usePersistenceEventHandler";
import { usePendingDeletions } from "../persistence/usePendingDeletions";
import { useCanvasOverlayLifecycleHandlers } from "./useCanvasOverlayLifecycleHandlers";

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const { addLabelToSidebar, removeLabelFromSidebar } = useLabelsContext();
  const handlePersistenceRequest = usePersistenceEventHandler();
  const { queueDeletion } = usePendingDeletions();
  const annotationEventBus = useAnnotationEventBus();

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

  useCanvasOverlayLifecycleHandlers({
    addLabelToSidebar,
    removeLabelFromSidebar,
    queueDeletion,
    annotationEventBus,
  });
};
