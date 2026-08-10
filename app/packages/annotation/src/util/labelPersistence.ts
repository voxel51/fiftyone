import {
  type JSONDeltas,
  patchSample,
  transformSampleData,
  VersionMismatchError,
} from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import { NotFoundError } from "@fiftyone/utilities";
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
/**
 * Observers of persisted sample patches. A listener receives the patch
 * exactly as it landed: the deltas, the pre-patch sample, the server's
 * post-patch sample, and the field-level metadata when the caller used
 * that fast path. Registered by downstream consumers (e.g. activity
 * analytics); failures never interfere with persistence.
 */
export interface PatchPersistedInfo {
  deltas: JSONDeltas;
  preSample: unknown;
  postSample: unknown;
  isGenerated: boolean;
  labelId?: string;
  opType?: string;
}

type PatchPersistedListener = (info: PatchPersistedInfo) => void;

const patchListeners = new Set<PatchPersistedListener>();

/** Returns an unsubscribe function. */
export const addPatchPersistedListener = (
  listener: PatchPersistedListener,
): (() => void) => {
  patchListeners.add(listener);
  return () => patchListeners.delete(listener);
};

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
  // The server's post-patch sample, for the persisted-patch listeners: a
  // new single-label field can arrive as ops whose values carry no label
  // id, so only the post state can say what was created.
  let postSample: unknown = null;

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
          labelId: labelId,
          path: labelPath,
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

      if (updatedSample) {
        // transform response data to match the graphql sample format
        const cleanedSample = transformSampleData(updatedSample);
        postSample = cleanedSample;
        if (isSampleIsh(cleanedSample)) {
          refreshSample(cleanedSample as Sample);
        } else {
          console.error(
            "response data does not adhere to sample format",
            cleanedSample,
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

  if (sampleDeltas.length > 0) {
    const info: PatchPersistedInfo = {
      deltas: sampleDeltas,
      preSample: sample,
      postSample,
      isGenerated: Boolean(isGenerated),
      labelId,
      opType,
    };
    for (const listener of patchListeners) {
      try {
        listener(info);
      } catch (err) {
        console.debug("patch listener failed", err);
      }
    }
  }

  return true;
};
