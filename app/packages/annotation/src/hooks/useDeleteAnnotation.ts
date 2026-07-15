/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
  usePersistAnnotationDeltas,
  type LabelRef,
} from "@fiftyone/annotation";
import { AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";

/**
 * Optional gesture id: when this delete is one commit of a larger gesture (e.g.
 * a merge's source delete), the gesture passes its id so the delete shares the
 * gesture's single undo unit.
 *
 * `ref` overrides the engine identity to delete at: the caller passes the
 * interaction-anchor ref for a video frame label, whose track `instanceId` and
 * `frame` (and full `frames.<field>` path) the label's `path` + doc `_id`
 * can't reconstruct. Sample-level labels omit it and delete by `label`.
 */
type DeleteAnnotationOptions = { gestureId?: string; ref?: LabelRef };

/**
 * Hook returning a callback that deletes an annotation label and persists the
 * removal. The engine owns the mutation + value-based undo; this orchestrates
 * persistence and the shared activity-toast events around it.
 *
 * Generated (patches) views are edit-only — both the Delete key and the menu
 * gate label removal off (`!isGenerated`), so this never persists a real
 * generated delete. The only path that reaches it on a generated view is the
 * undo of a not-yet-persisted draw, which nets to an empty patch (the unified
 * persist returns `null`, a no-op).
 *
 * @returns A callback that resolves `true` on success, `false` on failure, and
 *   rethrows so callers (e.g. the merge tool) can roll back.
 */
export const useDeleteAnnotation = (): ((
  label: AnnotationLabel,
  options?: DeleteAnnotationOptions,
) => Promise<boolean>) => {
  const eventBus = useAnnotationEventBus();
  const engine = useAnnotationEngine();
  const activeSample = useActiveAnnotationSampleId();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  return useCallback(
    async (label, options) => {
      const labelId = label.data._id;

      try {
        // Remove the label first, so a pending in-flight edit to it can't be
        // re-added by the next persistence pass (the delete and any prior edit
        // share the same field entry). Route it through the engine — not a
        // bare Sample mutation — so the delete lands on the value-based undo
        // stack (Ctrl-Z re-creates it); the engine still mutates the shared
        // Sample, so persistence and ordering are unchanged. A gesture's
        // `undoKey` (e.g. a merge's) coalesces this delete into its one unit.
        const ref = options?.ref ?? {
          sample: activeSample,
          path: label.path,
          instanceId: labelId,
        };

        // §9 await-and-rollback: for a standalone delete, hold the undo entry
        // this transaction pushes so a rejected persist can restore the label
        // (and drop the entry). A gesture delete (merge) carries a gestureId and
        // the gesture owns its own rollback, so we don't capture one here.
        let rollback: ReturnType<typeof engine.lastUndoEntry>;

        if (options?.gestureId) {
          engine.transaction(() => engine.deleteLabel(ref), {
            undoKey: options.gestureId,
          });
        } else {
          const prior = engine.lastUndoEntry();
          engine.deleteLabel(ref);
          const top = engine.lastUndoEntry();
          rollback = top === prior ? undefined : top;
        }

        // Flush immediately through the unified Sample path so the deletion
        // takes effect synchronously with the user action. Mirror
        // usePersistenceEventHandler's success/error dispatch so the shared
        // activity toast reflects the result, and rethrow so callers (e.g. the
        // merge tool) can roll back on failure.
        let success: boolean;
        try {
          success = (await persistAnnotationDeltas()) !== false;

          if (success) {
            eventBus.dispatch("annotation:persistenceSuccess");
          } else {
            // restore the label the server refused to delete (a later autosave
            // re-attempts under retry-by-default)
            if (rollback) {
              engine.rollbackEntry(rollback);
            }

            eventBus.dispatch("annotation:persistenceError", {
              error: new Error("Server rejected changes"),
            });
          }
        } catch (error) {
          if (rollback) {
            engine.rollbackEntry(rollback);
          }

          eventBus.dispatch("annotation:persistenceError", {
            error: error as Error,
          });
          throw error;
        }

        if (success) {
          eventBus.dispatch("annotation:deleteSuccess", {
            labelId,
            type: "delete",
            labelType: label.type,
          });
        } else {
          eventBus.dispatch("annotation:deleteError", {
            labelId,
            type: "delete",
          });
        }

        return success;
      } catch (error) {
        eventBus.dispatch("annotation:deleteError", {
          labelId,
          type: "delete",
          error: error as Error,
        });
        throw error;
      }
    },
    [activeSample, engine, eventBus, persistAnnotationDeltas],
  );
};
