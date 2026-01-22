import { useModalSample, useModalSampleSchema } from "@fiftyone/state";
import { useCallback } from "react";
import {
  buildJsonPath,
  buildLabelDeltas,
  getFieldSchema,
  LabelProxy,
} from "../deltas";
import type { JSONDeltas } from "@fiftyone/core";

export type LabelConstructor<T> = (data: T) => LabelProxy | undefined;

/**
 * Hook which provides a function capable of generating a {@link JSONDeltas}
 * for a given label.
 *
 * @param labelConstructor Function to create a {@link LabelProxy}
 * instance from the source label data.
 */
export const useGetLabelDelta = <T>(
  labelConstructor: LabelConstructor<T>
): ((labelSource: T, path: string) => JSONDeltas) => {
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
              "mutate"
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
    [labelConstructor, modalSample, modalSampleSchema]
  );
};
