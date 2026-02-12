import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import { useAnnotationEventBus } from "./useAnnotationEventBus";
import { useActivityToast, type AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";
import { IconName, Variant } from "@voxel51/voodo";
import {
  useLabelsContext,
  labels,
  labelMap,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import { DetectionLabel } from "@fiftyone/looker";
import { usePersistenceEventHandler } from "../persistence/usePersistenceEventHandler";
import { usePendingDeletions } from "../persistence/usePendingDeletions";
import { getDefaultStore } from "jotai";
import { current, editing, savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { _dangerousQuickDrawActiveAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useQuickDraw";

const STORE = getDefaultStore();

/**
 * Overlay IDs created during annotation (via the establish event).
 * Used to distinguish freshly-drawn Quick Draw labels from pre-existing
 * sample labels when selecting the previous overlay after undo.
 */
const sessionOverlayIds = new Set<string>();

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

  useAnnotationEventHandler(
    "annotation:canvasDetectionOverlayEstablish",
    useCallback(
      (payload) => {
        sessionOverlayIds.add(payload.overlay.id);
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
        // Capture label data before removal so we can queue a database
        // deletion if the label was already persisted (auto-saved).
        const allLabels = STORE.get(labels);
        const labelToRemove = allLabels.find(
          (l) => l.overlay.id === payload.id
        );
        if (labelToRemove) {
          queueDeletion(labelToRemove);
        }

        removeLabelFromSidebar(payload.id);
        sessionOverlayIds.delete(payload.id);

        const isQuickDraw = STORE.get(_dangerousQuickDrawActiveAtom);

        if (isQuickDraw) {
          // During Quick Draw, select the previous label after undo so the
          // user sees resize handles / move cursor on the preceding box.
          // Only consider overlays drawn in this session (sessionOverlayIds)
          // to avoid selecting pre-existing sample labels.
          const remainingLabels = STORE.get(labels);
          const candidates = remainingLabels.filter((l) =>
            sessionOverlayIds.has(l.overlay.id)
          );
          const prevLabel = candidates[candidates.length - 1];

          if (prevLabel) {
            const map = STORE.get(labelMap);
            const prevAtom = map[prevLabel.overlay.id];
            if (prevAtom) {
              STORE.set(savedLabel, prevLabel.data);
              STORE.set(editing, prevAtom);
              annotationEventBus.dispatch("annotation:sidebarLabelSelected", {
                id: prevLabel.overlay.id,
                type: prevLabel.type,
              });
            }
          } else {
            // Last session overlay undone — go back to baseline.
            STORE.set(editing, null);
            STORE.set(savedLabel, null);
            STORE.set(_dangerousQuickDrawActiveAtom, false);
            sessionOverlayIds.clear();
          }
        } else {
          // Not in Quick Draw — clear editing if the removed overlay was
          // the one being edited.
          const currentLabel = STORE.get(editing);
          if (
            currentLabel &&
            typeof currentLabel !== "string" &&
            (STORE.get(currentLabel) as AnnotationLabel | null)?.overlay?.id ===
              payload.id
          ) {
            STORE.set(editing, null);
            STORE.set(savedLabel, null);
          }
        }
      },
      [removeLabelFromSidebar, queueDeletion, annotationEventBus]
    )
  );

  // When the drawing session ends (undo of the first AddOverlayCommand in a
  // session), clean up annotation editing state so the user is back to normal.
  useAnnotationEventHandler(
    "annotation:drawingSessionEnded",
    useCallback(() => {
      const currentLabel = STORE.get(current) as AnnotationLabel | null;
      if (currentLabel?.isNew) {
        STORE.set(editing, null);
        STORE.set(savedLabel, null);
      }
      STORE.set(_dangerousQuickDrawActiveAtom, false);
      sessionOverlayIds.clear();
    }, [])
  );
};
