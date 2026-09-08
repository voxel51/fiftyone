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
  /**
   * The sample id that label-op ATTRIBUTION should use when it differs
   * from the persisted document: a grouped modal persists edits against
   * the slice document that owns them (the second camera, the pinned 3D
   * scene), while the modal's unit of work is the GRID anchor sample.
   * The unified persist loop passes the anchor here for every
   * non-generated patch; consumers that credit label work (e.g.
   * annotation-activity integrations downstream) attribute by this id
   * rather than the persisted document's.
   */
  attributionSampleId?: string;
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
  labelPath?: string;
  opType?: OpType;
  /** See DoPatchSampleArgs.attributionSampleId (grouped-modal anchor). */
  attributionSampleId?: string;
}

type PatchPersistedListener = (
  info: PatchPersistedInfo,
) => void | Promise<void>;

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
  attributionSampleId,
}: DoPatchSampleArgs): Promise<boolean> => {
  // The annotation endpoint implements a CRDT via a version token
  const versionToken = getVersionToken();

  if (!datasetId || !sample?._id || !versionToken) {
    // a sample without `last_modified_at` mints no token — name the failed
    // precondition instead of silently reporting "rejected"
    throw new Error(
      "cannot patch sample: missing write precondition " +
        JSON.stringify({
          hasDatasetId: !!datasetId,
          sampleId: sample?._id ?? null,
          hasVersionToken: !!versionToken,
        }),
    );
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

      throw error;
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
      labelPath,
      opType,
      attributionSampleId,
    };
    for (const listener of patchListeners) {
      try {
        // Async listeners are not awaited — persistence never blocks on
        // observers — but their rejections must not surface as unhandled.
        Promise.resolve(listener(info)).catch((err) => {
          console.debug("patch listener failed", err);
        });
      } catch (err) {
        console.debug("patch listener failed", err);
      }
    }
  }

  return true;
};
