import type { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import { isGeneratedView, useModalSample } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { usePatchSample } from "./usePatchSample";
import { handleLabelPersistence, type LabelPersistenceArgs } from "../util";
import { LabelProxy } from "../deltas";

/**
 * Hook which returns a callback to persist label updates for a sample.
 *
 * @param sample Sample against which to apply label update
 * @param applyPatch Function which handles the patch operation
 * @param opType Operation type
 * @param isGenerated Whether this is from a generated view
 */
const useLabelPersistenceWith = ({
  sample,
  applyPatch,
  opType,
  isGenerated,
}: Pick<
  LabelPersistenceArgs,
  "sample" | "applyPatch" | "opType" | "isGenerated"
>) => {
  return useCallback(
    (annotationLabel: LabelProxy, schema: Field): Promise<boolean> => {
      return handleLabelPersistence({
        sample,
        applyPatch,
        annotationLabel,
        schema,
        opType,
        isGenerated,
      });
    },
    [applyPatch, isGenerated, opType, sample]
  );
};

/**
 * Hook which returns a callback to upsert a label on the current modal sample.
 */
export const useUpsertLabel = (): ((
  annotationLabel: LabelProxy,
  schema: Field
) => Promise<boolean>) => {
  const isGenerated = useRecoilValue(isGeneratedView);

  return useLabelPersistenceWith({
    sample: useModalSample()?.sample,
    applyPatch: usePatchSample(),
    opType: "mutate",
    isGenerated,
  });
};

/**
 * Hook which provides a callback to delete a label from the current modal
 * sample.
 */
export const useDeleteLabel = (): ((
  annotationLabel: LabelProxy,
  schema: Field
) => Promise<boolean>) => {
  const isGenerated = useRecoilValue(isGeneratedView);

  return useLabelPersistenceWith({
    sample: useModalSample()?.sample,
    applyPatch: usePatchSample(),
    opType: "delete",
    isGenerated,
  });
};
