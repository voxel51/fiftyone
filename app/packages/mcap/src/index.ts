import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { McapGridRenderer } from "./McapGridRenderer";
import { McapModalRenderer } from "./McapModalRenderer";

/** Registry name for the built-in MCAP sample renderer. */
export const MCAP_SAMPLE_RENDERER_NAME = "McapSampleRenderer";

export * from "./api";
export { McapGridRenderer, McapModalRenderer };
export * from "./types";
export * from "./useMcapTimelineIndex";
export * from "./useMcapScene";

registerComponent({
  name: MCAP_SAMPLE_RENDERER_NAME,
  label: "MCAP",
  component: McapModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: () => true,
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: McapGridRenderer,
    },
  },
});
