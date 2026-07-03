import {
  PluginComponentType,
  registerComponent,
  SAMPLE_RENDERER_GRID_SLOT,
} from "@fiftyone/plugins";
import McapModalRenderer from "./react/McapModalRenderer";
import { initMcapWebGpuDeviceStatsDebugPublisher } from "./mcap-webgpu-device-stats-debug";
import { GridRenderer, McapGridStreamSelector } from "./react";

// App-wide debug bridge: mirrors WebGPU device-registry stats into a DOM
// attribute when mcap latency debug is enabled. Mounted here (not in the
// modal renderer) because grid preview cells hold devices outside the
// modal tree.
initMcapWebGpuDeviceStatsDebugPublisher();

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: McapModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: (ctx) => ctx.dataset?.mediaType === "multimodal",
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    // The modal keeps the renderer mounted through sample navigation;
    // per-sample state swaps by source (activateSource + keyed shell).
    modal: { persistAcrossSamples: true },
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
