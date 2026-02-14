import type { JSONDeltas } from "@fiftyone/core";
import {
  isGeneratedView,
  useModalSample,
  useModalSampleSchema,
} from "@fiftyone/state";
import type { Field } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { buildJsonPath, buildLabelDeltas, LabelProxy } from "../deltas";
import { getFieldSchema } from "../util";

export type LabelConstructor<T> = (data: T) => LabelProxy | undefined;

export type DeltaOpType = "mutate" | "delete";

export interface UseGetLabelDeltaOptions {
  /**
   * The operation type for delta generation.
   * - "mutate": For creating/updating labels (default)
   * - "delete": For deleting labels
   */
  opType?: DeltaOpType;
}

/**
 * Map from LabelProxy singular type to the plural embeddedDocType used by
 * list-based label fields (the kind the Schema Manager creates).
 */
const LABEL_TYPE_TO_EMBEDDED_DOC: Record<string, string> = {
  Detection: "fiftyone.core.labels.Detections",
  Classification: "fiftyone.core.labels.Classifications",
  Polyline: "fiftyone.core.labels.Polylines",
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
 * Hook which provides a function capable of generating a {@link JSONDeltas}
 * for a given label.
 *
 * @param labelConstructor Function to create a {@link LabelProxy}
 * instance from the source label data.
 * @param options Optional configuration including opType (defaults to "mutate")
 */
export const useGetLabelDelta = <T>(
  labelConstructor: LabelConstructor<T>,
  options: UseGetLabelDeltaOptions = {}
): ((labelSource: T, path: string) => JSONDeltas) => {
  const { opType = "mutate" } = options;
  const modalSample = useModalSample();
  const modalSampleSchema = useModalSampleSchema();
  const isGenerated = useRecoilValue(isGeneratedView);

  return useCallback(
    (labelSource: T, path: string) => {
      if (!modalSample?.sample) {
        return [];
      }

      const labelProxy = labelConstructor(labelSource);

      if (labelProxy) {
        const recoilSchema = getFieldSchema(modalSampleSchema, path);
        const inferred = recoilSchema ? null : inferFieldSchema(labelProxy);
        const schema = recoilSchema ?? inferred;

        if (schema) {
          const labelDeltas = buildLabelDeltas(
            modalSample.sample,
            labelProxy,
            schema,
            opType,
            isGenerated
          );

          return labelDeltas.map((delta) => ({
            ...delta,
            // convert label delta to sample delta
            // For generated views, paths are label-relative (SampleField
            // endpoint routes by field path + label ID in the URL)
            path: buildJsonPath(isGenerated ? null : path, delta.path),
          }));
        }
      }

      return [];
    },
    [isGenerated, labelConstructor, modalSample, modalSampleSchema, opType]
  );
};
