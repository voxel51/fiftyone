import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMcapResourceClient } from "./use-mcap-resource-client";
import { useMcapTopics, type McapTopicsState } from "./use-mcap-topics";
import { useStableMcapSource } from "./use-stable-mcap-source";

/**
 * Loads cached MCAP topic metadata for a sample renderer context.
 */
export function useMcapSampleTopics(
  ctx: SampleRendererProps["ctx"],
): McapTopicsState {
  const client = useMcapResourceClient({ worker: true });
  const source = useStableMcapSource(ctx);

  return useMcapTopics({ client, source });
}
