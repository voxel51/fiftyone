/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveAnnotationSampleId,
  useAnnotationEngine,
  useAnnotationEventBus,
  useDeleteLabel,
  usePersistAnnotationDeltas,
} from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { isGeneratedView } from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { DeleteAnnotationCommand } from "../commands";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const engine = useAnnotationEngine();
  const activeSample = useActiveAnnotationSampleId();
  const deleteLabel = useDeleteLabel();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();
  const isGenerated = useRecoilValue(isGeneratedView);

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;

        try {
          // Remove the label first, so a pending in-flight edit to it can't be
          // re-added by the next persistence pass (the delete and any prior edit
          // share the same field entry). Route it through the engine — not a
          // bare Sample mutation — so the delete lands on the value-based undo
          // stack (Ctrl-Z re-creates it); the engine still mutates the shared
          // Sample, so persistence and ordering are unchanged. A gesture's
          // `undoKey` (e.g. a merge's) coalesces this delete into its one unit.
          const ref = {
            sample: activeSample,
            path: cmd.label.path,
            instanceId: labelId,
          };

          if (cmd.gestureId) {
            engine.transaction(() => engine.deleteLabel(ref), {
              undoKey: cmd.gestureId,
            });
          } else {
            engine.deleteLabel(ref);
          }

          let success: boolean;
          if (isGenerated) {
            // Generated (patches) views persist removals onto the source sample
            // via the legacy delta path — `Sample.getJsonPatch()` does not emit
            // removes for generated views.
            success = (await deleteLabel(cmd.label, cmd.schema)) !== false;
          } else {
            // Flush immediately through the unified Sample path so the deletion
            // takes effect synchronously with the user action. Mirror
            // usePersistenceEventHandler's success/error dispatch so the shared
            // activity toast reflects the result, and rethrow so callers (e.g.
            // the merge tool) can roll back on failure.
            try {
              success = (await persistAnnotationDeltas()) !== false;

              if (success) {
                eventBus.dispatch("annotation:persistenceSuccess");
              } else {
                eventBus.dispatch("annotation:persistenceError", {
                  error: new Error("Server rejected changes"),
                });
              }
            } catch (error) {
              eventBus.dispatch("annotation:persistenceError", {
                error: error as Error,
              });
              throw error;
            }
          }

          if (success) {
            eventBus.dispatch("annotation:deleteSuccess", {
              labelId,
              type: "delete",
              labelType: cmd.label.type,
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
      [
        activeSample,
        deleteLabel,
        engine,
        eventBus,
        isGenerated,
        persistAnnotationDeltas,
      ]
    )
  );
};
