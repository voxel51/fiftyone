import type { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import {
  generatedDatasetName as generatedDatasetNameAtom,
  isGeneratedView,
  useCurrentDatasetId,
  useModalSample,
  useUpdateSamples,
} from "@fiftyone/state";
import type { Sample } from "@fiftyone/looker";
import { useRecoilValue } from "recoil";
import { handleLabelPersistence } from "../util";
import { LabelProxy } from "../deltas";
import type { OpType } from "../types";

/**
 * Returns a callback that persists a single label edit (upsert or delete) by
 * capturing its original and updated value and sending them to the server.
 */
const useLabelPersistenceWith = (
  opType: OpType
): ((annotationLabel: LabelProxy, schema: Field) => Promise<boolean>) => {
  const sample = useModalSample()?.sample ?? null;
  const datasetId = useCurrentDatasetId();
  const updateSamples = useUpdateSamples();
  const isGenerated = useRecoilValue(isGeneratedView);
  const generatedDatasetName = useRecoilValue(generatedDatasetNameAtom);

  return useCallback(
    (annotationLabel: LabelProxy, schema: Field): Promise<boolean> =>
      handleLabelPersistence({
        sample,
        datasetId,
        // In-place tile/modal update (no grid refresh).
        updateSample: (updated: Sample) =>
          updateSamples([[updated._id, updated]]),
        annotationLabel,
        schema,
        opType,
        isGenerated,
        generatedDatasetName: generatedDatasetName ?? undefined,
      }),
    [
      sample,
      datasetId,
      updateSamples,
      isGenerated,
      generatedDatasetName,
      opType,
    ]
  );
};

/**
 * Hook returning a callback that upserts a label on the current modal sample.
 */
export const useUpsertLabel = (): ((
  annotationLabel: LabelProxy,
  schema: Field
) => Promise<boolean>) => useLabelPersistenceWith("mutate");

/**
 * Hook returning a callback that deletes a label from the current modal sample.
 */
export const useDeleteLabel = (): ((
  annotationLabel: LabelProxy,
  schema: Field
) => Promise<boolean>) => useLabelPersistenceWith("delete");
