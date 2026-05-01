import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { SceneInventoryGridRenderer } from "../grid/SceneInventoryGridRenderer";
import { ModalRenderer } from "./ModalRenderer";

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
      overrideComponent: SceneInventoryGridRenderer,
    },
  },
});
