import type { Sample } from "@fiftyone/looker";
import type { Field } from "@fiftyone/utilities";
import { type JSONDeltas, patchSample } from "@fiftyone/core/src/client";
import { buildJsonPath, buildLabelDeltas, type OpType } from "../deltas";
import type { AnnotationLabel } from "@fiftyone/state";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import { transformSampleData } from "@fiftyone/core/src/client/transformer";

export type DoPatchSampleArgs = {
  sample: Sample | null;
  datasetId: string | null;
  getVersionToken: () => string;
  refreshSample: (sample: Sample) => void;
  sampleDeltas: JSONDeltas;
};

/**
 * Apply a patch of JSON deltas to a sample.
 *
 * @param sample Sample to apply patch against
 * @param datasetId Dataset ID for the sample
 * @param getVersionToken Function which returns a version token for the sample
 * @param refreshSample Function which refreshes sample data in the app
 * @param sampleDeltas List of JSON-patch deltas to apply
 */
export const doPatchSample = async ({
  sample,
  datasetId,
  getVersionToken,
  refreshSample,
  sampleDeltas,
}: DoPatchSampleArgs): Promise<boolean> => {
  // The annotation endpoint requires a version token in order to execute
  // mutations.
  const versionToken = getVersionToken();

  if (!datasetId || !sample?._id || !versionToken) {
    return false;
  }

  if (sampleDeltas.length > 0) {
    try {
      const response = await patchSample({
        datasetId,
        sampleId: sample._id,
        deltas: sampleDeltas,
        versionToken,
      });

      // transform response data to match the graphql sample format
      const cleanedSample = transformSampleData(response.sample);
      if (isSampleIsh(cleanedSample)) {
        refreshSample(cleanedSample as Sample);
      } else {
        console.error(
          "response data does not adhere to sample format",
          cleanedSample
        );
      }
    } catch (error) {
      console.error("error patching sample", error);

      return false;
    }
  }

  return true;
};

export type LabelPersistenceArgs = {
  sample: Sample | null;
  patchSample: (deltas: JSONDeltas) => Promise<boolean>;
  annotationLabel: AnnotationLabel | null;
  schema: Field;
  opType: OpType;
};

/**
 * Handle persisting a label update for a sample.
 *
 * @param sample Sample to modify
 * @param patchSample Function which applies the calculated patch
 * @param annotationLabel Label to persist
 * @param schema Field schema for the label
 * @param opType Operation type
 */
export const handleLabelPersistence = async ({
  sample,
  patchSample,
  annotationLabel,
  schema,
  opType,
}: LabelPersistenceArgs): Promise<boolean> => {
  if (!sample) {
    console.error("missing sample data!");
    return false;
  }

  if (!annotationLabel) {
    console.error("missing annotation label!");
    return false;
  }

  // calculate label deltas between current sample data and new label data
  const sampleDeltas = buildLabelDeltas(
    sample,
    annotationLabel,
    schema,
    opType
  ).map((delta) => ({
    ...delta,
    // convert label delta to sample delta
    path: buildJsonPath(annotationLabel.path, delta.path),
  }));

  return await patchSample(sampleDeltas);
};
