/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventBus, useDeleteLabel } from "@fiftyone/annotation";
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

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        console.log("Handling DeleteAnnotationCommand for cmd", cmd);
        try {
          const labelId = cmd.label.data._id;
          const success = await deleteLabel(cmd.label, cmd.schema);

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
};
