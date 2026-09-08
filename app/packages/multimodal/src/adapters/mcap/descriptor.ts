import type { AdapterDescriptor, SampleDescriptor } from "../../ports";

/** Returns whether lightweight sample facts identify an MCAP episode. */
export function detectMcapSample(sample: SampleDescriptor): boolean {
  return (
    sample.mediaType === "multimodal" &&
    !sample.mediaReference &&
    (sample.path == null || /\.mcap(?:$|[?#])/i.test(sample.path))
  );
}

/** Tiny MCAP descriptor that keeps the heavy adapter graph behind `load()`. */
export const mcapAdapterDescriptor: AdapterDescriptor = {
  detect: detectMcapSample,
  id: "mcap",
  load: async () => {
    const { createMcapFormatAdapter } = await import("./format-adapter");
    return createMcapFormatAdapter();
  },
};
