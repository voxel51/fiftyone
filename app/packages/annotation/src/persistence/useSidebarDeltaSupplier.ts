import { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";
import { useSampleMutationManager } from "./useSampleMutationManager";
import { Primitive } from "@fiftyone/utilities";
import { LabelProxy } from "../deltas";
import { useGetLabelDelta } from "./useGetLabelDelta";
import { OpType } from "../types";

/**
 * Method for constructing a {@link LabelProxy} from a primitive value.
 *
 * @param data Primitive data
 * @param path Field path
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
 * Hook which provides a {@link DeltaSupplier} which captures changes isolated
 * to the annotation sidebar.
 */
export const useSidebarDeltaSupplier = (): DeltaSupplier => {
  const { stagedMutations } = useSampleMutationManager();
  const getLabelDelta = useGetLabelDelta(buildLabelProxy);

  return useCallback(() => {
    return Object.entries(stagedMutations)
      .map(([path, mutation]) =>
        getLabelDelta({ data: mutation.data, path, op: mutation.op }, path)
      )
      .flat();
  }, [getLabelDelta, stagedMutations]);
};
