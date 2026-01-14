/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useAnnotationEventBus,
  useDeleteLabel,
  useUpsertLabel,
} from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/commands";
import { useCallback } from "react";
import { DeleteAnnotationCommand, UpsertAnnotationCommand } from "../commands";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const deleteLabel = useDeleteLabel();
  const upsertLabel = useUpsertLabel();

  useRegisterCommandHandler(
    UpsertAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;
        try {
          const success = await upsertLabel(cmd.label, cmd.schema);

          if (success) {
            eventBus.dispatch("annotation:upsertSuccess", {
              labelId,
              type: "upsert",
            });
          } else {
            eventBus.dispatch("annotation:upsertError", {
              labelId,
              type: "upsert",
            });
          }
          return success;
        } catch (error) {
          eventBus.dispatch("annotation:upsertError", {
            labelId,
            type: "upsert",
            error: error as Error,
          });
          throw error;
        }
      },
      [eventBus, upsertLabel]
    )
  );

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;
        try {
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
            labelId,
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
