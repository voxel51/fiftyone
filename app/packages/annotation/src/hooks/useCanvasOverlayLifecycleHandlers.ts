/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback } from "react";
import { getDefaultStore } from "jotai";
import { type AnnotationLabel } from "@fiftyone/state";
import { DetectionLabel } from "@fiftyone/looker";
import {
  type LabelsContext,
  labels,
  labelMap,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useLabels";
import {
  current,
  editing,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { _dangerousQuickDrawActiveAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useQuickDraw";
import { useAnnotationEventHandler } from "./useAnnotationEventHandler";
import type { useAnnotationEventBus } from "./useAnnotationEventBus";
import type { usePendingDeletions } from "../persistence/usePendingDeletions";
import {
  trackOverlay,
  untrackOverlay,
  getSessionOverlayIds,
  clearSessionTracking,
  resetDrawingSession,
} from "./annotationSession";

const STORE = getDefaultStore();

interface CanvasOverlayLifecycleDeps {
  addLabelToSidebar: LabelsContext["addLabelToSidebar"];
  removeLabelFromSidebar: LabelsContext["removeLabelFromSidebar"];
  queueDeletion: ReturnType<typeof usePendingDeletions>["queueDeletion"];
  annotationEventBus: ReturnType<typeof useAnnotationEventBus>;
}

/**
 * Registers event handlers for canvas overlay lifecycle events:
 * establish, removed, and drawing-session-ended.
 */
export const useCanvasOverlayLifecycleHandlers = ({
  addLabelToSidebar,
  removeLabelFromSidebar,
  queueDeletion,
  annotationEventBus,
}: CanvasOverlayLifecycleDeps) => {
  useAnnotationEventHandler(
    "annotation:canvasDetectionOverlayEstablish",
    useCallback(
      (payload) => {
        // Guard against duplicates (e.g. redo dispatching establish for an
        // overlay that is already in the sidebar).
        const allLabels = STORE.get(labels);
        if (allLabels.some((l) => l.overlay.id === payload.overlay.id)) {
          return;
        }

        trackOverlay(payload.overlay.id);
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
        untrackOverlay(payload.id);

        const isQuickDraw = STORE.get(_dangerousQuickDrawActiveAtom);

        if (isQuickDraw) {
          // During Quick Draw, select the previous label after undo so the
          // user sees resize handles / move cursor on the preceding box.
          // Only consider overlays drawn in this session (sessionOverlayIds)
          // to avoid selecting pre-existing sample labels.
          const remainingLabels = STORE.get(labels);
          const sessionIds = getSessionOverlayIds();
          const candidates = remainingLabels.filter((l) =>
            sessionIds.has(l.overlay.id)
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
            resetDrawingSession();
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
        resetDrawingSession();
      } else {
        // Label is persisted — only reset quickDraw + session tracking,
        // leave editing state intact.
        clearSessionTracking();
      }
    }, [])
  );
};
