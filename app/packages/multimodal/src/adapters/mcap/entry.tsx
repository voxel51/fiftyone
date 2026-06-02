import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import McapModalRenderer from "./react/McapModalRenderer";
import { GridRenderer } from "./react";

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: McapModalRenderer,
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
