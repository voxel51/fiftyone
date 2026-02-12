import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useActivityToast, type AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import { useLabelsContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { DetectionLabel } from "@fiftyone/looker";
import { usePersistenceEventHandler } from "../persistence/usePersistenceEventHandler";
import { getDefaultStore } from "jotai";
import { current, editing, savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { _dangerousQuickDrawActiveAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useQuickDraw";

const STORE = getDefaultStore();

/**
 * Hook which registers global annotation event handlers.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationEventHandlers = () => {
  const { setConfig } = useActivityToast();
  const { addLabelToSidebar, removeLabelFromSidebar } = useLabelsContext();
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

  useAnnotationEventHandler(
    "annotation:canvasDetectionOverlayRemoved",
    useCallback(
      (payload) => {
        removeLabelFromSidebar(payload.id);

        // Clear editing state if the removed overlay was the one being edited.
        const currentLabel = STORE.get(current) as AnnotationLabel | null;
        if (currentLabel?.overlay?.id === payload.id) {
          STORE.set(editing, null);
          STORE.set(savedLabel, null);
        }
      },
      [removeLabelFromSidebar]
    )
  );

  // When the drawing session ends (undo of the enter-drawing-mode command),
  // clean up all annotation editing state so the user is fully back to normal.
  useAnnotationEventHandler(
    "annotation:drawingSessionEnded",
    useCallback(() => {
      const currentLabel = STORE.get(current) as AnnotationLabel | null;
      if (currentLabel?.isNew) {
        STORE.set(editing, null);
        STORE.set(savedLabel, null);
      }
      STORE.set(_dangerousQuickDrawActiveAtom, false);
    }, [])
  );
};
