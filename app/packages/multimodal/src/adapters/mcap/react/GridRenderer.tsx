/**
 * THIS IS POC CODE FOR DEMO COUPLED WITH NUSCENES.
 * TODO(FOEPD-3830): REPLACE THIS DECODE/FETCH SLICE WITH PRODUCTION CODE.
 */
import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMcapSampleTopics } from "./use-mcap-sample-topics";

/**
 * Grid proof renderer for MCAP-backed multimodal samples.
 */
export function GridRenderer({ ctx }: SampleRendererProps) {
  const topicState = useMcapSampleTopics(ctx);

  if (topicState.status === "ready") {
    return <div>{topicState.topics.length} topics</div>;
  }

  const message =
    topicState.status === "idle"
      ? "MCAP source missing"
      : topicState.status === "error"
      ? "Topics unavailable"
      : "Loading topics";

  return (
    <div>
      <div>{message}</div>
      {topicState.status === "error" && <div>{topicState.error}</div>}
    </div>
  );
}
