/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useAnnotationEngine,
  useAnnotationEventBus,
  usePersistAnnotationDeltas,
  type LabelRef,
} from "@fiftyone/annotation";
import { AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";

/**
 * Hook returning a callback that deletes an entire object track — every
 * occurrence of a `(sample, path, instanceId)` across the engine's loaded
 * frames — and persists the removal. The single-frame {@link useDeleteAnnotation}
 * drops one occurrence; this drops the whole track so a video Delete matches the
 * timeline's "Delete track" action.
 *
 * All occurrences are removed in one engine transaction, so the track drops on a
 * single undo unit (Ctrl-Z restores the whole track). Mirrors
 * {@link useDeleteAnnotation}'s persistence + activity-toast orchestration and
 * await-and-rollback so a rejected persist restores the track.
 *
 * @returns A callback that resolves `true` on success, `false` on failure, and
 *   rethrows so callers can react to a failed persist.
 */
export const useDeleteTrack = (): ((
  label: AnnotationLabel,
  ref: LabelRef,
) => Promise<boolean>) => {
  const eventBus = useAnnotationEventBus();
  const engine = useAnnotationEngine();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  return useCallback(
    async (label, ref) => {
      const labelId = label.data._id;

      try {
        // Every frame this track occupies on its own field, read through the
        // engine — the authoritative loaded window (whole clip today).
        const frames = engine.loadedFrames(ref.sample).filter((frame) =>
          engine.getLabel({
            sample: ref.sample,
            path: ref.path,
            instanceId: ref.instanceId,
            frame,
          }),
        );

        // Delete every occurrence as one undo unit; hold the entry it pushes so
        // a rejected persist can restore the whole track (and drop the entry).
        const prior = engine.lastUndoEntry();

        engine.transaction(() => {
          for (const frame of frames) {
            engine.deleteLabel({
              sample: ref.sample,
              path: ref.path,
              instanceId: ref.instanceId,
              frame,
            });
          }
        });

        const top = engine.lastUndoEntry();
        const rollback = top === prior ? undefined : top;

        let success: boolean;
        try {
          success = (await persistAnnotationDeltas()) !== false;

          if (success) {
            eventBus.dispatch("annotation:persistenceSuccess");
          } else {
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
          // let selection/editing consumers drop state bound to this track
          eventBus.dispatch("annotation:trackDeleted", {
            trackId: ref.instanceId,
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
    [engine, eventBus, persistAnnotationDeltas],
  );
};
