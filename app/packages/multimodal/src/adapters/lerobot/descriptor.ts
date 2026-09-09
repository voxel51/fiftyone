import type { AdapterDescriptor, SampleDescriptor } from "../../ports";

/** The stored reference class a LeRobot episode carries. */
const LEROBOT_EPISODE_REFERENCE = "LeRobotEpisodeReference";

/** Returns whether lightweight sample facts identify a LeRobot episode. */
export function detectLeRobotSample(sample: SampleDescriptor): boolean {
  return (
    sample.mediaType === "multimodal" &&
    sample.mediaReference?._cls === LEROBOT_EPISODE_REFERENCE
  );
}

/**
 * Tiny descriptor that keeps Parquet and MP4 parsing behind `load()`.
 * Format-specific view extensions ride the same lazy load, but the
 * injection root composes them in — the adapter layer stays view-free.
 */
export const leRobotAdapterDescriptor: AdapterDescriptor = {
  detect: detectLeRobotSample,
  id: "lerobot-v3",
  load: async () => {
    const { createLeRobotFormatAdapter } = await import("./format-adapter");
    return createLeRobotFormatAdapter();
  },
};
