import {
  type JSONDeltas,
  patchSample,
  transformSampleData,
  VersionMismatchError,
} from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import type { Field } from "@fiftyone/utilities";
import { buildJsonPath, buildLabelDeltas, LabelProxy } from "../deltas";
import type { OpType } from "../types";

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
 * Any HTTP errors will be thrown and should be handled by the caller.
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
  // The annotation endpoint implements a CRDT via a version token
  const versionToken = getVersionToken();

  if (!datasetId || !sample?._id || !versionToken) {
    return false;
  }

  let caughtErr: Error;

  if (sampleDeltas.length > 0) {
    try {
      let updatedSample: Sample;

      try {
        const response = await patchSample({
          datasetId,
          sampleId: sample._id,
          deltas: sampleDeltas,
          versionToken,
        });
        updatedSample = response.sample;
      } catch (err) {
        // catch and defer any HTTP errors
        caughtErr = err;

        // In the case of a version mismatch,
        // the updated sample data is returned in the response body.
        // We use this to refresh the app's sample data,
        // and any pending changes will be re-attempted on the next patch
        if (err instanceof VersionMismatchError) {
          updatedSample = err.responseBody as Sample;
        }
      }

      if (updatedSample) {
        // transform response data to match the graphql sample format
        const cleanedSample = transformSampleData(updatedSample);
        if (isSampleIsh(cleanedSample)) {
          refreshSample(cleanedSample as Sample);
        } else {
          console.error(
            "response data does not adhere to sample format",
            cleanedSample
          );
        }
      } else {
        console.warn("received empty sample data; deltas may be stale");
      }
    } catch (error) {
      console.error("error patching sample", error);

      return false;
    }
  }

  // raise HTTP errors to the caller
  if (caughtErr) {
    throw caughtErr;
  }

  return true;
};

export type LabelPersistenceArgs = {
  sample: Sample | null;
  applyPatch: (deltas: JSONDeltas) => Promise<boolean>;
  annotationLabel: LabelProxy | null;
  schema: Field;
  opType: OpType;
};

/**
 * Handle persisting a label update for a sample.
 *
 * @param sample Sample to modify
 * @param applyPatch Function which applies the calculated patch
 * @param annotationLabel Label to persist
 * @param schema Field schema for the label
 * @param opType Operation type
 */
export const handleLabelPersistence = async ({
  sample,
  applyPatch,
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

  return await applyPatch(sampleDeltas);
};
