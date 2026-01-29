import { DeltaSupplier } from "./deltaSupplier";
import { useCallback } from "react";
import { useSampleMutationManager } from "./useSampleMutationManager";
import { Primitive } from "@fiftyone/utilities";
import { LabelProxy } from "../deltas";
import { useGetLabelDelta } from "./useGetLabelDelta";

/**
 * Method for constructing a {@link LabelProxy} from a primitive value.
 *
 * @param data Primitive data
 * @param path Field path
 */
const buildLabelProxy = ({
  data,
  path,
}: {
  data: Primitive;
  path: string;
}): LabelProxy => ({
  data,
  path,
  type: "Primitive",
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
      .map(([path, data]) => getLabelDelta({ data, path }, path))
      .flat();
  }, [getLabelDelta, stagedMutations]);
};
