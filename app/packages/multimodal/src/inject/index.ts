import { mcapAdapterDescriptor } from "../adapters/mcap/descriptor";
import { initMcapCostBufferObserver } from "../adapters/mcap/instrumentation/host/mcap-cost-buffer";
import { initMcapCostDebugBridge } from "../adapters/mcap/instrumentation/host/mcap-cost-debug";
import { initMcapCostDecompressionCacheObserver } from "../adapters/mcap/instrumentation/host/mcap-cost-decompression-cache";
import { initMcapCostVisualizationObserver } from "../adapters/mcap/instrumentation/host/mcap-cost-visualization";
import { initMcapLatencyObserver } from "../adapters/mcap/instrumentation/host/mcap-latency-debug";
import { registerFormatAdapter } from "../runtime/adapter-registry";
import { registerEpisodeViews } from "../views/entry";

// App-wide, opt-in initialization belongs at the injection boundary so every
// episode surface shares one capture domain.
initMcapCostDebugBridge();
initMcapCostBufferObserver();
initMcapCostDecompressionCacheObserver();
initMcapCostVisualizationObserver();
initMcapLatencyObserver();
registerFormatAdapter(mcapAdapterDescriptor);
registerEpisodeViews();
