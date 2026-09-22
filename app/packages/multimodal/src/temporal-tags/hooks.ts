import type { SampleRendererProps } from "@fiftyone/plugins";
import { useSampleTemporalTags } from "@fiftyone/state";
import type { TemporalTagFilter, TemporalTagsClient } from "@fiftyone/state";

/**
 * Loads temporal tags for a sample renderer context.
 */
export function useSampleRendererTemporalTags(
  ctx: SampleRendererProps["ctx"],
  options: {
    readonly client?: TemporalTagsClient;
    readonly filter?: TemporalTagFilter;
  } = {},
) {
  return useSampleTemporalTags({
    client: options.client,
    datasetId: ctx.dataset.datasetId,
    filter: options.filter,
    sampleId: ctx.sample.sample._id,
  });
}
