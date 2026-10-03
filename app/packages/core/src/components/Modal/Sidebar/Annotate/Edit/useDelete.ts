import {
  getFieldSchema,
  useDeleteAnnotation,
  useDeleteTrack,
} from "@fiftyone/annotation";
import { isDetection3dOverlay, isPolyline3dOverlay } from "@fiftyone/looker-3d";
import * as fos from "@fiftyone/state";
import { isGeneratedView } from "@fiftyone/state";

import {
  KnownCommands,
  KnownContexts,
  useKeyBindings,
} from "@fiftyone/commands";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { useAnnotationContext } from "./useAnnotationContext";
import useDiscardDraft from "./useDiscardDraft";
import useExit from "./useExit";

interface KeypointVertexSelection {
  getSelectedPointIndex(): number | null;
  getRelativePoints(): [number, number][];
}

/**
 * True while a canvas vertex is sub-selected and removing it would leave
 * geometry behind. Removing the only point removes the label, so Delete
 * falls through to the whole-label delete.
 */
const isVertexSubSelected = (overlay: unknown): boolean => {
  const selection = overlay as KeypointVertexSelection;
  if (
    !overlay ||
    typeof selection.getSelectedPointIndex !== "function" ||
    typeof selection.getRelativePoints !== "function"
  ) {
    return false;
  }

  const index = selection.getSelectedPointIndex();
  return (
    index != null && index >= 0 && selection.getRelativePoints().length > 1
  );
};

export default function useDelete() {
  const { selected } = useAnnotationContext();
  const label = selected?.label;
  // engine identity from the anchor — carries the track instanceId + frame +
  // `frames.<field>` path a video frame label needs; null for sample-level
  const ref = selected?.ref ?? undefined;
  const selectedOverlay = selected?.overlay;
  const deleteAnnotation = useDeleteAnnotation();
  const deleteTrack = useDeleteTrack();
  // The combined sample + frame schema: a video frame label's path is
  // `frames.<field>`, and the frame fields live in the FRAME space — absent from
  // the SAMPLE schema, so the guard below would reject every persisted frame
  // label. `fullSchema` nests the frame fields under a synthetic `frames` field
  // so `getFieldSchema` resolves both sample- and frame-level paths.
  const schema = useRecoilValue(fos.fullSchema);

  const exit = useExit();
  const discardDraft = useDiscardDraft();
  const setNotification = fos.useNotification();
  const isGenerated = useRecoilValue(isGeneratedView);

  // Delete is a plain action — the engine's value-based undo stack captures the
  // delete (via useDeleteAnnotation → engine.deleteLabel) and owns restoring it
  // on Ctrl-Z, so no DelegatingUndoable / command-context undo is registered.
  const performDelete = useCallback(async () => {
    if (!label) {
      return;
    }

    // A sub-selected polyline/keypoint vertex is removed by the canvas keydown
    // handler; defer to it so Backspace edits the vertex instead of deleting
    // the whole label/track. The command bus fires before that handler, so the
    // sub-point index still reads its pre-removal value here.
    if (isVertexSubSelected(selectedOverlay)) {
      return;
    }

    if (label.isNew) {
      discardDraft();
      return;
    }

    try {
      const fieldSchema = getFieldSchema(schema, label?.path);

      if (!fieldSchema) {
        setNotification({
          msg: `Unable to delete label: field schema not found for path "${
            label?.path ?? "unknown"
          }".`,
          variant: "error",
        });
        return;
      }

      // A video frame label's anchor carries a `frame`; Delete removes the
      // whole track (every occurrence), matching the timeline's "Delete track".
      // Image / sample-level labels (no `frame`) delete just their one entry.
      // The engine's read-half does the rest: the bridge loop unmounts the
      // overlay and the list mirror drops the row(s) on the delete tick.
      if (ref?.frame != null) {
        await deleteTrack(label, ref);
      } else {
        await deleteAnnotation(label, ref ? { ref } : undefined);
      }

      exit();
    } catch (error) {
      // Persistence success/failure is surfaced by the shared annotation
      // activity toast (annotation:persistenceSuccess / :persistenceError);
      // don't show a duplicate legacy toast here.
      console.error(error);
    }
  }, [
    deleteAnnotation,
    deleteTrack,
    discardDraft,
    exit,
    label,
    ref,
    schema,
    selectedOverlay,
    setNotification,
  ]);

  useKeyBindings(
    KnownContexts.ModalAnnotate,
    [
      {
        commandId: KnownCommands.ModalDeleteAnnotation,
        handler: performDelete,
        enablement: () => {
          // Disable delete for generated views (patches/clips/frames)
          if (!label || isGenerated) {
            return false;
          }

          const is3dLabel =
            isPolyline3dOverlay(label.data) || isDetection3dOverlay(label.data);

          if (is3dLabel) {
            // Todo: handled in useAnnotationActions.tsx, reconcile
            return false;
          }

          return !!label;
        },
        sequence: ["Delete", "Backspace"],
        label: "Delete label",
        description: "Delete label",
      },
    ],
    [performDelete, isGenerated],
  );
}
