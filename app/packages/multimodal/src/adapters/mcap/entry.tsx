import {
  PluginComponentType,
  registerComponent,
  SAMPLE_RENDERER_GRID_SLOT,
} from "@fiftyone/plugins";
import McapModalRenderer from "./react/McapModalRenderer";
import { GridRenderer, McapGridStreamSelector } from "./react";

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: McapModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: GridRenderer,
      slots: {
        [SAMPLE_RENDERER_GRID_SLOT.HEADER_AFTER_RESOURCE_COUNT]:
          McapGridStreamSelector,
      },
    },
  },
});
