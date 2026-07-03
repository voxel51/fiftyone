import {
  subscribeWebGpuDeviceStats,
  webGpuDeviceStats,
  type WebGpuDeviceStats,
} from "../../visualization/panels/webgpu-device-registry";
import { isMcapLatencyDebugEnabled } from "./mcap-debug-flags";

/**
 * DOM attribute the device stats are mirrored into, following the
 * `data-mcap-latency-*` publishing idiom in `mcap-latency-debug.ts`.
 * Read by `perf/webgpu-freeze-probe.mjs` at the end of a run.
 */
export const WEBGPU_DEVICE_STATS_ATTRIBUTE = "data-webgpu-device-stats";

type McapDebugGlobal = typeof globalThis & {
  document?: Document;
  window?: Window & typeof globalThis;
};

let unsubscribe: (() => void) | null = null;

/**
 * Mirrors `webGpuDeviceStats()` into the `data-webgpu-device-stats` DOM
 * attribute whenever mcap latency debug is enabled.
 *
 * Layering: the registry lives in `visualization/panels/` and knows
 * nothing about mcap; this module is the mcap-side bridge that publishes
 * its stats through the mcap debug channel.
 *
 * Mount point: called once from the mcap entry module (`entry.tsx`), not
 * from a component inside the modal renderer — grid preview cells mount
 * WebGPU canvases outside the modal tree, so a modal-scoped observer
 * (the McapStreams-style bridge) would go blind exactly on the surface
 * whose device count scales with dataset size. `entry.tsx` is the one
 * place mcap wiring runs app-wide: it registers both the grid and modal
 * renderers, and is imported by `inject/index.ts` at app startup.
 *
 * The subscription is deliberately dumb: the registry invokes it
 * synchronously on every register/release, and the flag check (cached)
 * plus one attribute write are cheap at renderer-lifecycle frequency.
 */
export function initMcapWebGpuDeviceStatsDebugPublisher(): () => void {
  if (!unsubscribe) {
    publishWebGpuDeviceStats(webGpuDeviceStats());
    unsubscribe = subscribeWebGpuDeviceStats(publishWebGpuDeviceStats);
  }

  return stopMcapWebGpuDeviceStatsDebugPublisher;
}

/** Detaches the registry subscription (idempotent; used by tests). */
export function stopMcapWebGpuDeviceStatsDebugPublisher(): void {
  unsubscribe?.();
  unsubscribe = null;
}

function publishWebGpuDeviceStats(stats: WebGpuDeviceStats): void {
  if (!isMcapLatencyDebugEnabled()) return;

  try {
    const root = globalThis as McapDebugGlobal;
    const document = root.document ?? root.window?.document;
    if (!document) return;

    document.documentElement.setAttribute(
      WEBGPU_DEVICE_STATS_ATTRIBUTE,
      JSON.stringify(stats),
    );
  } catch {
    // DOM publishing is best-effort debug data.
  }
}
