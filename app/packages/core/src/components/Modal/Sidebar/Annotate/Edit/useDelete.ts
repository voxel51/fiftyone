import {
  getFieldSchema,
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useDeleteAnnotation,
} from "@fiftyone/annotation";
import { useLighter } from "@fiftyone/lighter";
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
import useExit from "./useExit";

export default function useDelete() {
  const { scene, removeOverlay } = useLighter();
  const { selected } = useAnnotationContext();
  const label = selected?.label;
  // engine identity from the anchor — carries the track instanceId + frame +
  // `frames.<field>` path a video frame label needs; null for sample-level
  const ref = selected?.ref ?? undefined;
  const engine = useAnnotationEngine();
  const deleteAnnotation = useDeleteAnnotation();
  const sample = useActiveAnnotationSampleId();
  // Use fullSchema so frame-level paths (e.g. "frames.detections" on video
  // datasets) resolve. The sample-only schema doesn't include the `frames`
  // root, so getFieldSchema returns null and the delete bails. fullSchema
  // wraps the frame fields under a synthetic `frames` field for lookups.
  const schema = useRecoilValue(fos.fullSchema);

  const exit = useExit();
  const setNotification = fos.useNotification();
  const isGenerated = useRecoilValue(isGeneratedView);

  // Delete is a plain action — the engine's value-based undo stack captures the
  // delete (via useDeleteAnnotation → engine.deleteLabel) and owns restoring it
  // on Ctrl-Z, so no DelegatingUndoable / command-context undo is registered.
  const performDelete = useCallback(async () => {
    if (!label) {
      return;
    }

    if (label.isNew) {
      // a label still being drawn lives in interactive mode — leave it and
      // tear down its in-progress overlay
      if (scene && !scene.isDestroyed && scene.renderLoopActive) {
        scene?.exitInteractiveMode();
        removeOverlay(label?.data._id, true);
      }

      // also drop it from the engine: `isNew` is form-side bookkeeping, but a
      // drawn label is already engine-committed, so the engine-derived sidebar
      // only removes the row (and autosave only persists the delete + Ctrl-Z
      // only restores it) once the engine is told. A no-op if never committed.
      engine.deleteLabel(
        ref ?? {
          sample,
          path: label.path,
          instanceId: label.data._id,
        },
      );

      exit();
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

      // the engine's read-half does the rest: the bridge loop unmounts
      // the overlay and the list mirror drops the row on the delete tick
      await deleteAnnotation(label, ref ? { ref } : undefined);

      exit();
    } catch (error) {
      // Persistence success/failure is surfaced by the shared annotation
      // activity toast (annotation:persistenceSuccess / :persistenceError);
      // don't show a duplicate legacy toast here.
      console.error(error);
    }
  }, [
    deleteAnnotation,
    engine,
    exit,
    label,
    ref,
    removeOverlay,
    sample,
    scene,
    schema,
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
