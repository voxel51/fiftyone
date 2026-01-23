/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  PersistAnnotationChanges,
  useAnnotationEventBus,
  useDeleteLabel,
  usePersistAnnotationDeltas,
  useUpsertLabel,
  LabelProxy,
} from "@fiftyone/annotation";
import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useCallback } from "react";
import { DeleteAnnotationCommand, UpsertAnnotationCommand } from "../commands";
import { AnnotationLabel, PrimitiveValue } from "@fiftyone/state";
import { BoundingBoxOverlay } from "@fiftyone/lighter";
import {
  CLASSIFICATION,
  DETECTION,
  POLYLINE,
  PRIMITIVE,
} from "@fiftyone/utilities";

/**
 * Convert an AnnotationLabel to a LabelProxy for persistence operations.
 * PrimitiveValue labels are already in the correct format and returned as-is.
 */
const convertToLabelProxy = (
  label: AnnotationLabel | PrimitiveValue
): LabelProxy | undefined => {
  // PrimitiveValue is already a valid LabelProxy
  if (label.type === PRIMITIVE) {
    return label as PrimitiveValue;
  }

  const annotationLabel = label as AnnotationLabel;

  if (annotationLabel.type === DETECTION) {
    const overlay = annotationLabel.overlay;

    // For 2D detections with BoundingBoxOverlay, extract the bounding box
    if (overlay instanceof BoundingBoxOverlay) {
      const bounds = overlay.getRelativeBounds();
      return {
        type: DETECTION,
        data: annotationLabel.data,
        boundingBox: [bounds.x, bounds.y, bounds.width, bounds.height],
        path: annotationLabel.path,
      };
    }

    // For 3D detections, no bounding box needed
    return {
      type: DETECTION,
      data: annotationLabel.data,
      path: annotationLabel.path,
    };
  } else if (annotationLabel.type === CLASSIFICATION) {
    return {
      type: CLASSIFICATION,
      data: annotationLabel.data,
      path: annotationLabel.path,
    };
  } else if (annotationLabel.type === POLYLINE) {
    return {
      type: POLYLINE,
      data: annotationLabel.data,
      path: annotationLabel.path,
    };
  }

  return undefined;
};

/**
 * Hook that registers command handlers for annotation persistence.
 * This should be called once in the composition root.
 */
export const useRegisterAnnotationCommandHandlers = () => {
  const eventBus = useAnnotationEventBus();
  const deleteLabel = useDeleteLabel();
  const upsertLabel = useUpsertLabel();
  const persistAnnotationDeltas = usePersistAnnotationDeltas();

  useRegisterCommandHandler(
    UpsertAnnotationCommand,
    useCallback(
      async (cmd) => {
        // Convert AnnotationLabel to LabelProxy (PrimitiveValue is returned as-is)
        const labelProxy = convertToLabelProxy(cmd.label);

        if (!labelProxy) {
          const error = new Error("Failed to convert label to proxy");
          eventBus.dispatch("annotation:upsertError", {
            labelId: undefined,
            type: "upsert",
            error,
          });
          return false;
        }

        // Get labelId for event tracking (only AnnotationLabels have _id)
        const labelId =
          labelProxy.type !== PRIMITIVE
            ? (labelProxy.data as unknown)._id
            : undefined;

        try {
          const success = await upsertLabel(labelProxy, cmd.schema);

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
          // Convert AnnotationLabel to LabelProxy if needed
          const labelProxy = convertToLabelProxy(cmd.label);

          if (!labelProxy) {
            eventBus.dispatch("annotation:deleteError", {
              labelId,
              type: "delete",
              error: new Error("Failed to convert label to proxy"),
            });
            return false;
          }

          const success = await deleteLabel(labelProxy, cmd.schema);

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
