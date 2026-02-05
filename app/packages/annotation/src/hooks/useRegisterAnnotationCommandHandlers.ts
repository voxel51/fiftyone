/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  PersistAnnotationChanges,
  useAnnotationEventBus,
  useDeleteLabel,
  usePersistAnnotationDeltas,
} from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useCallback } from "react";
import { DeleteAnnotationCommand } from "../commands";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const deleteLabel = useDeleteLabel();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        try {
          const labelId = cmd.label.data._id;
          const success = await deleteLabel(cmd.label, cmd.schema);

          if (success) {
            eventBus.dispatch("annotation:deleteSuccess", {
              labelId,
              type: "delete",
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
            labelId: cmd?.label?.data?._id,
            type: "delete",
            error: error as Error,
          });
          throw error;
        }
      },
      [deleteLabel, eventBus]
    )
  );

  useRegisterCommandHandler(
    PersistAnnotationChanges,
    useCallback(async () => {
      try {
        const success = await persistAnnotationDeltas();

        if (success === null) {
          // no-op
        } else if (success) {
          eventBus.dispatch("annotation:persistenceSuccess");
        } else {
          eventBus.dispatch("annotation:persistenceError", {
            error: new Error("Server rejected changes"),
          });
        }
        return success;
      } catch (error) {
        eventBus.dispatch("annotation:persistenceError", { error });
        return false;
      }
    }, [eventBus, persistAnnotationDeltas])
  );
};
