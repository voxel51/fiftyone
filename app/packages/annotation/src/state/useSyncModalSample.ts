import {
  useFrameSchema,
  useModalSample,
  useModalSampleSchema,
} from "@fiftyone/state";
import { registerNonfiniteFields } from "@fiftyone/utilities";
import { useEffect } from "react";
import { useSampleInstance } from "./useSample";

/**
 * Hydrate the shared {@link Sample} from the Recoil-backed modal sample.
 *
 * - On schema change (sample or frame): registers the dataset's float fields
 *   as non-finite fields, so a custom float attribute's `"nan"` echo compares
 *   equal and is never written back as a string; then updates the schema.
 * - On sample-id change: clears pending transient edits.
 * - On sample data change: re-sets source data (Sample's internal `gc` drops
 *   transient entries that have been incorporated into the new source — this
 *   is also the autosave-roundtrip reconciliation point).
 * - On unmount: discards pending transient edits — annotation exit paths
 *   never touch the store; this lifecycle owns the clear.
 *
 * Mount once at the annotation root.
 */
export const useSyncModalSample = (): void => {
  const sample = useSampleInstance();
  const modalSample = useModalSample();
  const schema = useModalSampleSchema();
  const frameSchema = useFrameSchema();

  const sampleId = modalSample?.sample?._id;
  const sampleData = modalSample?.sample;

  // registered ahead of the data effects, so the first echo compare already
  // knows the dataset's float fields
  useEffect(() => {
    if (schema) {
      registerNonfiniteFields(schema);
    }

    if (frameSchema) {
      registerNonfiniteFields(frameSchema);
    }
  }, [schema, frameSchema]);

  useEffect(() => {
    sample.clear();
  }, [sample, sampleId]);

  useEffect(() => () => sample.clear(), [sample]);

  useEffect(() => {
    if (sampleData) {
      sample.setData(sampleData as Record<string, unknown>);
    }
  }, [sample, sampleData]);

  useEffect(() => {
    if (schema) {
      sample.setSchema(schema);
    }
  }, [sample, schema]);
};
