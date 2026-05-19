import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { GridRenderer } from "./GridRenderer";
import { MultiModalPlaybackRenderer } from "./MultiModalPlaybackRenderer";

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: MultiModalPlaybackRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: () => true,
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: GridRenderer,
    },
  },
});
