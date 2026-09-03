import type { AdapterDescriptor, SampleDescriptor } from "../../ports";

/** Returns whether lightweight sample facts identify a LeRobot episode. */
export function detectLeRobotSample(sample: SampleDescriptor): boolean {
  return (
    sample.mediaType === "multimodal" &&
    sample.mediaReference?.kind === "lerobot-episode"
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
