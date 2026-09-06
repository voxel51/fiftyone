import type { PaginateSamplesNode } from "@fiftyone/relay";
import { withMediaAssetSrcs } from "@fiftyone/utilities";

export const handleNode = (
  node: PaginateSamplesNode,
  mediaSources?: Readonly<Record<string, string>> | null,
) => {
  if (node.__typename === "%other") {
    throw new Error("unexpected sample type");
  }

  return {
    ...node,
    sample: withMediaAssetSrcs(
      // Relay will not allow objects when hydrating a scalar value
      // For that reason, samples that have been updated manually via
      // fos.useUpdateSamples are represented as strings
      // - https://github.com/voxel51/fiftyone/pull/2622
      // - https://github.com/facebook/relay/issues/91
      typeof node.sample === "string" ? JSON.parse(node.sample) : node.sample,
      mediaSources,
    ),
  };
};
