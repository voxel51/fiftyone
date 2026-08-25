import type { AdapterDescriptor, SampleDescriptor } from "../../ports";

/** Returns whether lightweight sample facts identify a LeRobot episode. */
export function detectLeRobotSample(sample: SampleDescriptor): boolean {
  return (
    sample.mediaType === "multimodal" &&
    sample.mediaReference?.kind === "lerobot-episode"
  );
}

/** Tiny descriptor that keeps Parquet and MP4 parsing behind `load()`. */
export const leRobotAdapterDescriptor: AdapterDescriptor = {
  detect: detectLeRobotSample,
  id: "lerobot-v3",
  load: async () => {
    // The LeRobot tile extension registers as a side effect of this lazy
    // load, so it exists before any session can expose hasStateAction and
    // never enters the initial bundle for non-LeRobot sessions.
    const [{ createLeRobotFormatAdapter }] = await Promise.all([
      import("./format-adapter"),
      import("../../views/episode/state-action/register-state-action-tile"),
    ]);
    return createLeRobotFormatAdapter();
  },
};
