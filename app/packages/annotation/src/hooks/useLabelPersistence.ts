import type { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import { type AnnotationLabel, useModalSample } from "@fiftyone/state";
import { usePatchSample } from "./usePatchSample";
import { handleLabelPersistence, type LabelPersistenceArgs } from "../util";

/**
 * Hook which returns a callback to persist label updates for a sample.
 *
 * @param sample Sample against which to apply label update
 * @param applyPatch Function which handles the patch operation
 * @param opType Operation type
 */
const useLabelPersistenceWith = ({
  sample,
  applyPatch,
  opType,
}: Pick<LabelPersistenceArgs, "sample" | "applyPatch" | "opType">) => {
  return useCallback(
    (annotationLabel: AnnotationLabel, schema: Field): Promise<boolean> => {
      return handleLabelPersistence({
        sample,
        applyPatch,
        annotationLabel,
        schema,
        opType,
      });
    },
    [applyPatch, opType, sample]
  );
};

/**
 * Hook which returns a callback to upsert a label on the current modal sample.
 */
export const useUpsertLabel = (): ((
  annotationLabel: AnnotationLabel,
  schema: Field
) => Promise<boolean>) => {
  return useLabelPersistenceWith({
    sample: useModalSample()?.sample,
    applyPatch: usePatchSample(),
    opType: "mutate",
  });
};

/**
 * Hook which provides a callback to delete a label from the current modal
 * sample.
 */
export const useDeleteLabel = (): ((
  annotationLabel: AnnotationLabel,
  schema: Field
) => Promise<boolean>) => {
  return useLabelPersistenceWith({
    sample: useModalSample()?.sample,
    applyPatch: usePatchSample(),
    opType: "delete",
  });
};
