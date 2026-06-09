/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventBus, useDeleteLabel } from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useLighter } from "@fiftyone/lighter";
import { useCallback } from "react";
import { DeleteAnnotationCommand } from "../commands";
import { useTombstoneTemporalDetection } from "../persistence/temporalDetectionTombstones";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const deleteLabel = useDeleteLabel();
  const { removeOverlay } = useLighter();
  const tombstoneTemporalDetection = useTombstoneTemporalDetection();

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId = cmd.label.data._id;

        if (cmd.label.type === "TemporalDetection") {
          // Mark the TD for deletion; defer to save tick
          tombstoneTemporalDetection(cmd.label.overlay.field, labelId);
          // Optimistic removal
          removeOverlay(cmd.label.overlay.id, false);

          eventBus.dispatch("annotation:deleteSuccess", {
            labelId,
            type: "delete",
            labelType: cmd.label.type,
          });

          return true;
        }

        try {
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
      [deleteLabel, eventBus, removeOverlay, tombstoneTemporalDetection]
    )
  );
};
