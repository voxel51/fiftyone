import {
  getLocalSample,
  isGeneratedView,
  useModalSample,
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

export type LabelConstructor<T> = (data: T) => LabelProxy | undefined;

export type DeltaOpType = "mutate" | "delete";

export interface UseGetLabelDeltaOptions {
  /**
   * The operation type.
   * - "mutate": creating/updating a label (default)
   * - "delete": deleting a label
   */
  opType?: DeltaOpType;
  /**
   * Return the delta even when it is a no-op. Callers that record edits into
   * the pending-edits store always record; the store resolves no-ops.
   */
  includeUnchanged?: boolean;
}

/**
 * Map from a {@link LabelProxy} singular type to the plural embeddedDocType of
 * the list field the Schema Manager creates.
 */
const LABEL_TYPE_TO_EMBEDDED_DOC: Record<string, string> = {
  Detection: "fiftyone.core.labels.Detections",
  Classification: "fiftyone.core.labels.Classifications",
  Polyline: "fiftyone.core.labels.Polylines",
  Keypoint: "fiftyone.core.labels.Keypoints",
};

/**
 * Build a minimal {@link Field} from a {@link LabelProxy} so capture can
 * proceed even when the Recoil schema cache is briefly stale (e.g. right after
 * a field is created via the Schema Manager).
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
 * Hook which provides a function that captures a label edit as a
 * {@link LabelFieldDelta} — the original value and the updated value — for a
 * given label source. Returns `null` when the delta can't be expressed.
 *
 * @param labelConstructor Builds a {@link LabelProxy} from the source data
 * @param options Optional config (opType defaults to "mutate")
 */
export const useGetLabelDelta = <T>(
  labelConstructor: LabelConstructor<T>,
  options: UseGetLabelDeltaOptions = {}
): ((labelSource: T, path: string) => LabelFieldDelta | null) => {
  const { opType = "mutate", includeUnchanged = false } = options;
  const modalSample = useModalSample();
  const modalSampleSchema = useModalSampleSchema();
  const isGenerated = useRecoilValue(isGeneratedView);

  return useCallback(
    (labelSource: T, path: string) => {
      if (!modalSample?.sample) {
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
      const sample = (getLocalSample(modalSample.sample._id) ??
        modalSample.sample) as unknown as Parameters<
        typeof buildLabelFieldDelta
      >[0];

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
      includeUnchanged,
      isGenerated,
      labelConstructor,
      modalSample,
      modalSampleSchema,
      opType,
    ]
  );
};
