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

// Tracks the last version token sent in a PATCH and the one received back.
// When getVersionToken() still returns the sent token but the server responded
// with a different one, React closures are stale (haven't re-rendered yet).
// In that case we skip the save — the next auto-save after re-render will
// pick up pending changes with correct deltas and version token.
let _lastSent: string | null = null;
let _lastReceived: string | null = null;
let _lastSampleId: string | null = null;

/** @internal - for testing only */
export const _resetPatchState = () => {
  _lastSent = null;
  _lastReceived = null;
  _lastSampleId = null;
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
  // Reset tracking state when the sample changes (e.g. modal navigation)
  if (sample?._id !== _lastSampleId) {
    _lastSent = null;
    _lastReceived = null;
    _lastSampleId = sample?._id ?? null;
  }

  // The annotation endpoint implements a CRDT via a version token
  const versionToken = getVersionToken();

  if (!datasetId || !sample?._id || !versionToken) {
    return false;
  }

  // Detect stale React closures: if getVersionToken() returns what we last
  // sent but the server responded with a newer token, the hooks haven't
  // re-rendered yet. Skip this save — both the version token and the deltas
  // (computed from the same stale base sample) would be wrong.
  if (
    _lastSent &&
    _lastReceived &&
    versionToken === _lastSent &&
    _lastReceived !== _lastSent
  ) {
    return true;
  }

  let caughtErr: Error;

  if (sampleDeltas.length > 0) {
    try {
      let updatedSample: Sample;

      try {
        _lastSent = versionToken;
        const response = await patchSample({
          datasetId,
          sampleId: sample._id,
          deltas: sampleDeltas,
          versionToken,
        });
        updatedSample = response.sample;
        _lastReceived = response.versionToken ?? versionToken;
      } catch (err) {
        // catch and defer any HTTP errors
        caughtErr = err;

        // In the case of a version mismatch,
        // the updated sample data is returned in the response body.
        // We use this to refresh the app's sample data,
        // and any pending changes will be re-attempted on the next patch
        if (err instanceof VersionMismatchError) {
          updatedSample = err.responseBody as Sample;
          _lastReceived = err.versionToken ?? versionToken;
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
