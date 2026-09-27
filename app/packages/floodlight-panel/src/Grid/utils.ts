import type { PaginateSamplesNode } from "@fiftyone/relay";

export const handleNode = (node: PaginateSamplesNode) => {
  if (node.__typename === "%other") {
    throw new Error("unexpected sample type");
  }

  return {
    ...node,
    sample:
      // Relay will not allow objects when hydrating a scalar value
      // For that reason, samples that have been updated manually via
      // fos.useUpdateSamples are represented as strings
      // - https://github.com/voxel51/fiftyone/pull/2622
      // - https://github.com/facebook/relay/issues/91
      typeof node.sample === "string" ? JSON.parse(node.sample) : node.sample,
  };
};
