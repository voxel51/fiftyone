import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { MultimodalGridRenderer } from "./MultimodalGridRenderer";
import { MultimodalModalRenderer } from "./MultimodalModalRenderer";

/** Registry name for the built-in multimodal sample renderer. */
export const MULTIMODAL_SAMPLE_RENDERER_NAME = "MultimodalSampleRenderer";

export * from "./archetypes";
export * from "./api";
export { MultimodalGridRenderer, MultimodalModalRenderer };
export * from "./types";
export * from "./useMultimodalPlaybackController";
export * from "./useMultimodalTimelineIndex";
export * from "./useMultimodalWorkspace";

registerComponent({
  name: MULTIMODAL_SAMPLE_RENDERER_NAME,
  label: "Multimodal",
  component: MultimodalModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: () => true,
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: MultimodalGridRenderer,
    },
  },
});
