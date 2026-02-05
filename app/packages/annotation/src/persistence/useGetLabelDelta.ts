import type { JSONDeltas } from "@fiftyone/core";
import { useModalSample, useModalSampleSchema } from "@fiftyone/state";
import { useCallback } from "react";
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

  return useCallback(
    (labelSource: T, path: string) => {
      if (modalSample?.sample) {
        const fieldSchema = getFieldSchema(modalSampleSchema, path);

        if (fieldSchema) {
          const labelProxy = labelConstructor(labelSource);

          if (labelProxy) {
            const labelDeltas = buildLabelDeltas(
              modalSample.sample,
              labelProxy,
              fieldSchema,
              opType
            );

            return labelDeltas.map((delta) => ({
              ...delta,
              // convert label delta to sample delta
              path: buildJsonPath(path, delta.path),
            }));
          }
        }
      }

      return [];
    },
    [labelConstructor, modalSample, modalSampleSchema, opType]
  );
};
