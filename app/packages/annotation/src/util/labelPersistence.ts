import {
  type JSONDeltas,
  patchSample,
  transformSampleData,
  VersionMismatchError,
} from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import type { Field } from "@fiftyone/utilities";
import { NotFoundError } from "@fiftyone/utilities";
import {
  buildAnnotationPath,
  buildJsonPath,
  buildLabelDeltas,
  LabelProxy,
} from "../deltas";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import type { OpType } from "../types";

export type DoPatchSampleArgs = {
  sample: Sample | null;
  datasetId: string | null;
  getVersionToken: () => string;
  refreshSample: (sample: Sample) => void;
  sampleDeltas: JSONDeltas;
  isGenerated?: boolean;
  generatedDatasetName?: string;
  labelId?: string;
  labelPath?: string;
  opType?: OpType;
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
 * @param isGenerated Whether this is from a generated view (patches/clips/frames)
 * @param generatedDatasetName Name of the generated dataset (if applicable)
 * @param labelId Label ID for field-level updates (if applicable)
 * @param labelPath Path to the label field (if applicable)
 * @param opType Operation type (mutate/delete)
 */
export const doPatchSample = async ({
  sample,
  datasetId,
  getVersionToken,
  refreshSample,
  sampleDeltas,
  isGenerated,
  generatedDatasetName,
  labelId,
  labelPath,
  opType,
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
      // For generated views, use _sample_id so that the sampleId and datasetId
      // always refer to the persistent source.
      const sampleId = isGenerated
        ? (sample as Sample & { _sample_id?: string })._sample_id
        : sample._id;

      try {
        const response = await patchSample({
          datasetId,
          sampleId: sampleId,
          deltas: sampleDeltas,
          versionToken,
          // Pass generated view parameters for field-level updates
          labelId: isGenerated ? labelId : undefined,
          path: isGenerated ? labelPath : undefined,
          generatedDatasetName,
          generatedSampleId: isGenerated ? sample._id : undefined,
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

      if (isGenerated && opType === "delete") {
        // Response contains the source sample and the patch sample was deleted
        // so don't attempt to refresh the patch sample
        return true;
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
      // For delete operations on generated views (patches/clips/frames), a 404
      // is expected because the sample in the generated dataset is deleted
      // Note that although this is currently disabled in the UI,
      // the backend already supports it
      if (
        isGenerated &&
        opType === "delete" &&
        error instanceof NotFoundError
      ) {
        return true;
      }

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
  applyPatch: (
    deltas: JSONDeltas,
    patchOptions?: {
      labelId?: string;
      labelPath?: string;
      opType?: OpType;
    }
  ) => Promise<boolean>;
  annotationLabel: LabelProxy | null;
  schema: Field;
  opType: OpType;
  isGenerated?: boolean;
};

/**
 * Handle persisting a label update for a sample.
 *
 * @param sample Sample to modify
 * @param applyPatch Function which applies the calculated patch
 * @param annotationLabel Label to persist
 * @param schema Field schema for the label
 * @param opType Operation type
 * @param isGenerated Whether this is from a generated view (patches/clips/frames)
 */
export const handleLabelPersistence = async ({
  sample,
  applyPatch,
  annotationLabel,
  schema,
  opType,
  isGenerated = false,
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
    opType,
    isGenerated
  ).map((delta) => ({
    ...delta,
    // Convert label delta to sample delta
    // Operation path is the label path for patches views
    path: buildJsonPath(isGenerated ? null : annotationLabel.path, delta.path),
  }));

  // For SampleField patch updates on generated views
  const patchOptions = isGenerated
    ? {
        labelId: (annotationLabel as { data?: { _id?: string } }).data?._id,
        labelPath: buildAnnotationPath(annotationLabel, isGenerated),
        opType,
      }
    : undefined;

  return await applyPatch(sampleDeltas, patchOptions);
};
