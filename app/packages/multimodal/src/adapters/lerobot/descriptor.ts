import type { AdapterDescriptor, SampleDescriptor } from "../../ports";

/** Returns whether lightweight sample facts identify a LeRobot episode. */
export function detectLeRobotSample(sample: SampleDescriptor): boolean {
  if (sample.mediaType === "application/x-lerobot") return true;
  const path = sample.path ?? "";
  return (
    /^lerobot:/i.test(path) ||
    /(?:^|\/)meta\/info\.json(?:$|[?#])/i.test(path) ||
    /\.lerobot\.json(?:$|[?#])/i.test(path)
  );
}

/** Tiny descriptor that keeps Parquet and MP4 parsing behind `load()`. */
export const leRobotAdapterDescriptor: AdapterDescriptor = {
  detect: detectLeRobotSample,
  id: "lerobot",
  load: async () => {
    const { createLeRobotFormatAdapter } = await import("./format-adapter");
    return createLeRobotFormatAdapter();
  },
};
