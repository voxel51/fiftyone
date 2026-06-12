import type { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";
import { useSampleMutationManager } from "./useSampleMutationManager";
import { Primitive } from "@fiftyone/utilities";
import { LabelProxy } from "../deltas";
import { useGetLabelDelta } from "./useGetLabelDelta";
import { OpType } from "../types";

/**
 * Construct a {@link LabelProxy} from a primitive value.
 */
const buildLabelProxy = ({
  data,
  path,
  op,
}: {
  data: Primitive;
  path: string;
  op?: OpType;
}): LabelProxy => ({
  data,
  path,
  type: "Primitive",
  op,
});

/**
 * Hook which provides a {@link DeltaSupplier} capturing changes isolated to
 * the annotation sidebar (primitive field edits).
 */
export const useSidebarDeltaSupplier = (): DeltaSupplier => {
  const { stagedMutations } = useSampleMutationManager();
  const getLabelDelta = useGetLabelDelta(buildLabelProxy);

  return useCallback(
    () => ({
      deltas: Object.entries(stagedMutations)
        .map(([path, mutation]) =>
          getLabelDelta({ data: mutation.data, path, op: mutation.op }, path)
        )
        .filter((delta): delta is NonNullable<typeof delta> => !!delta),
    }),
    [getLabelDelta, stagedMutations]
  );
};
