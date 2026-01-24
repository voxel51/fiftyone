import type { Sample } from "@fiftyone/looker";
import type { Field } from "@fiftyone/utilities";
import { type JSONDeltas, patchSample } from "@fiftyone/core/src/client";
import {
  buildAnnotationPath,
  buildJsonPath,
  buildLabelDeltas,
  LabelProxy,
  type OpType,
} from "../deltas";
import { isSampleIsh } from "@fiftyone/looker/src/util";
import { transformSampleData } from "@fiftyone/core/src/client/transformer";

export type DoPatchSampleArgs = {
  sample: Sample | null;
  datasetId: string | null;
  getVersionToken: () => string;
  refreshSample: (sample: Sample) => void;
  sampleDeltas: JSONDeltas;
  // Generated view specific parameters
  isGenerated?: boolean;
  generatedDatasetName?: string;
  labelId?: string;
  labelPath?: string;
  opType?: OpType;
};

/**
 * Apply a patch of JSON deltas to a sample.
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
  // The annotation endpoint requires a version token in order to execute
  // mutations.
  const versionToken = getVersionToken();

  if (!datasetId || !sample?._id || !versionToken) {
    return false;
  }

  if (sampleDeltas.length > 0) {
    try {
      // For patches views, use _sample_id (source sample) if available
      const sampleId =
        (sample as Sample & { _sample_id?: string })._sample_id || sample._id;

      const response = await patchSample({
        datasetId,
        sampleId,
        deltas: sampleDeltas,
        versionToken,
        // Pass generated view parameters for field-level updates
        labelId: isGenerated ? labelId : undefined,
        path: isGenerated ? labelPath : undefined,
        generatedDatasetName,
        generatedSampleId: isGenerated ? sample._id : undefined,
      });

      // For delete operations on patches, the patch sample is deleted and
      // the backend returns the source sample. We can't refresh the modal
      // with the source sample (different structure), so we skip the refresh.
      // The modal should close automatically via other mechanisms.
      if (isGenerated && opType === "delete") {
        return true;
      }

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
    // convert label delta to sample delta
    // For generated views, pass null as the label path since the backend
    // uses the labelPath parameter for field-level routing
    path: buildJsonPath(isGenerated ? null : annotationLabel.path, delta.path),
  }));

  // For generated views, pass additional metadata for field-level updates
  const patchOptions = isGenerated
    ? {
        labelId: (annotationLabel as { data?: { _id?: string } }).data?._id,
        labelPath: buildAnnotationPath(annotationLabel, isGenerated),
        opType,
      }
    : undefined;

  return await applyPatch(sampleDeltas, patchOptions);
};
