import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { GridRenderer, ModalRenderer } from "./react";

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: ModalRenderer,
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
