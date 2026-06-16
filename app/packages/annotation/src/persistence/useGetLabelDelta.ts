import {
  getLocalSample,
  isGeneratedView,
  useModalSampleSchema,
} from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import {
  buildLabelFieldDelta,
  type LabelFieldDelta,
  type LabelProxy,
} from "../deltas";
import { getFieldSchema } from "../util";
import { useAnnotationTargetSample } from "./useAnnotationTargetSample";

export type LabelConstructor<T> = (data: T) => LabelProxy | undefined;

export type DeltaOpType = "mutate" | "delete";

export interface UseGetLabelDeltaOptions {
  /**
   * The operation type for delta generation.
   * - "mutate": For creating/updating labels (default)
   * - "delete": For deleting labels
   */
  opType?: DeltaOpType;
  /**
   * Return the delta even when it is a no-op. Callers that record edits into
   * the pending-edits store always record; the store resolves no-ops.
   */
  includeUnchanged?: boolean;
}

/**
 * Map from LabelProxy singular type to the plural embeddedDocType used by
 * list-based label fields (the kind the Schema Manager creates).
 */
const LABEL_TYPE_TO_EMBEDDED_DOC: Record<string, string> = {
  Detection: "fiftyone.core.labels.Detections",
  Classification: "fiftyone.core.labels.Classifications",
  Polyline: "fiftyone.core.labels.Polylines",
  Keypoint: "fiftyone.core.labels.Keypoints",
};

/**
 * Build a minimal {@link Field} from a {@link LabelProxy} type so that delta
 * generation can proceed even when the Recoil schema cache is stale (e.g.
 * immediately after a field is created via the Schema Manager).
 */
const inferFieldSchema = (labelProxy: LabelProxy): Field | null => {
  if (!("type" in labelProxy)) return null;

  const embeddedDocType = LABEL_TYPE_TO_EMBEDDED_DOC[labelProxy.type];
  if (!embeddedDocType) return null;

  return {
    embeddedDocType,
    ftype: "fiftyone.core.fields.EmbeddedDocumentField",
    name: labelProxy.path?.split(".").pop() ?? "",
    path: labelProxy.path ?? "",
    dbField: null,
    description: null,
    info: null,
    subfield: null,
  };
};

/**
 * Hook which provides a function capable of generating a
 * {@link LabelFieldDelta} (the original and updated value) for a given label,
 * or `null` when the delta can't be expressed.
 *
 * @param labelConstructor Function to create a {@link LabelProxy}
 * instance from the source label data.
 * @param options Optional configuration including opType (defaults to "mutate")
 */
export const useGetLabelDelta = <T>(
  labelConstructor: LabelConstructor<T>,
  options: UseGetLabelDeltaOptions = {}
): ((labelSource: T, path: string) => LabelFieldDelta | null) => {
  const { opType = "mutate", includeUnchanged = false } = options;
  // The sample being annotated follows the active viewer (3D scene vs 2D), so
  // a 3D edit diffs against — and saves to — its own slice's sample.
  const targetSample = useAnnotationTargetSample();
  const modalSampleSchema = useModalSampleSchema();
  const isGenerated = useRecoilValue(isGeneratedView);

  return useCallback(
    (labelSource: T, path: string) => {
      if (!targetSample) {
        return null;
      }

      const labelProxy = labelConstructor(labelSource);
      if (!labelProxy) {
        return null;
      }

      const recoilSchema = getFieldSchema(modalSampleSchema, path);
      const schema = recoilSchema ?? inferFieldSchema(labelProxy);
      if (!schema) {
        return null;
      }

      // The previous value MUST come from the canonical store, read
      // synchronously at call time — a React render snapshot races the
      // save/ack cycle, and a stale snapshot here becomes a wrong save
      // precondition (the historical source of single-user 409s). The render
      // value is only the fallback for a sample that has never been edited.
      const sample = (getLocalSample(targetSample._id) ??
        targetSample) as unknown as Parameters<typeof buildLabelFieldDelta>[0];

      return buildLabelFieldDelta(
        sample,
        labelProxy,
        schema,
        opType,
        isGenerated,
        includeUnchanged
      );
    },
    [
      targetSample,
      includeUnchanged,
      isGenerated,
      labelConstructor,
      modalSampleSchema,
      opType,
    ]
  );
};
