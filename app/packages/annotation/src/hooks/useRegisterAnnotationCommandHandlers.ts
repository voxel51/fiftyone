/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useAnnotationEventBus } from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useModalSample, type AnnotationLabel } from "@fiftyone/state";
import { useCallback } from "react";
import { DeleteAnnotationCommand } from "../commands";
import type { LabelProxy } from "../deltas";
import { useGetLabelDelta } from "../persistence/useGetLabelDelta";
import { useRecordEdit } from "../persistence/useRecordEdit";

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const sampleId = useModalSample()?.sample?._id ?? null;
  const recordEdit = useRecordEdit();
  const getDeleteDelta = useGetLabelDelta(
    (label: AnnotationLabel) => label as unknown as LabelProxy,
    { opType: "delete", includeUnchanged: true }
  );

  useRegisterCommandHandler(
    DeleteAnnotationCommand,
    useCallback(
      async (cmd) => {
        const labelId =
          (cmd.label.data as { _id?: string } | undefined)?._id ?? null;
        const delta = sampleId && getDeleteDelta(cmd.label, cmd.label.path);
        if (!delta) {
          eventBus.dispatch("annotation:deleteError", {
            labelId,
            type: "delete",
          });
          return false;
        }

        // Record the delete; the next flush persists it alongside any other
        // pending edits (a delete of a label that never reached the server
        // resolves to a no-op there).
        recordEdit(sampleId, delta);

        eventBus.dispatch("annotation:deleteSuccess", {
          labelId,
          type: "delete",
          labelType: cmd.label.type,
        });
        return true;
      },
      [eventBus, getDeleteDelta, recordEdit, sampleId]
    )
  );
};
