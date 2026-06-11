import {
  PLUGIN_COMPONENT_SLOT,
  PluginComponentType,
  registerComponent,
} from "@fiftyone/plugins";
import McapModalRenderer from "./react/McapModalRenderer";
import { GridRenderer, McapGridStreamSelector } from "./react";

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

registerComponent({
  name: "McapGridStreamSelector",
  label: "MCAP grid stream selector",
  component: McapGridStreamSelector,
  type: PluginComponentType.Component,
  activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
  componentOptions: {
    slots: [PLUGIN_COMPONENT_SLOT.GRID_HEADER_AFTER_RESOURCE_COUNT],
  },
});
