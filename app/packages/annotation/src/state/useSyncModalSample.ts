import { useModalSample, useModalSampleSchema } from "@fiftyone/state";
import { useEffect } from "react";
import { useSample } from "./useSample";

/**
 * Hydrate the shared {@link Sample} from the Recoil-backed modal sample.
 *
 * - On sample-id change: clears pending transient edits.
 * - On sample data change: re-sets source data (Sample's internal `gc` drops
 *   transient entries that have been incorporated into the new source — this
 *   is also the autosave-roundtrip reconciliation point).
 * - On schema change: updates the schema.
 *
 * Mount once at the annotation root.
 */
export const useSyncModalSample = (): void => {
  const sample = useSample();
  const modalSample = useModalSample();
  const schema = useModalSampleSchema();

  const sampleId = modalSample?.sample?._id;
  const sampleData = modalSample?.sample;

  useEffect(() => {
    sample.clear();
  }, [sample, sampleId]);

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
