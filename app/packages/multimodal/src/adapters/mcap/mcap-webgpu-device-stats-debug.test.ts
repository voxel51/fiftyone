import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WEBGPU_DEVICE_BUDGET,
  registerWebGpuRenderer,
  resetWebGpuDeviceRegistryForTests,
} from "../../visualization/panels/webgpu-device-registry";
import {
  WEBGPU_DEVICE_STATS_ATTRIBUTE,
  initMcapWebGpuDeviceStatsDebugPublisher,
  stopMcapWebGpuDeviceStatsDebugPublisher,
} from "./mcap-webgpu-device-stats-debug";

function setLatencyDebugParam(enabled: boolean): void {
  // The debug-flag check caches per href, so changing the URL is what
  // makes the flag re-evaluate between tests.
  window.history.replaceState(null, "", enabled ? "/?mcapLatencyDebug=1" : "/");
}

function readPublishedStats(): Record<string, unknown> | null {
  const raw = document.documentElement.getAttribute(
    WEBGPU_DEVICE_STATS_ATTRIBUTE,
  );
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeEach(() => {
  stopMcapWebGpuDeviceStatsDebugPublisher();
  resetWebGpuDeviceRegistryForTests();
  document.documentElement.removeAttribute(WEBGPU_DEVICE_STATS_ATTRIBUTE);
});

afterEach(() => {
  stopMcapWebGpuDeviceStatsDebugPublisher();
  resetWebGpuDeviceRegistryForTests();
  document.documentElement.removeAttribute(WEBGPU_DEVICE_STATS_ATTRIBUTE);
  setLatencyDebugParam(false);
  vi.restoreAllMocks();
});

describe("mcap webgpu device stats debug publisher", () => {
  it("mirrors registry stats into the DOM attribute when debug is enabled", () => {
    setLatencyDebugParam(true);
    initMcapWebGpuDeviceStatsDebugPublisher();

    expect(readPublishedStats()).toMatchObject({ total: 0 });

    const registration = registerWebGpuRenderer("grid-preview");
    expect(readPublishedStats()).toMatchObject({
      bySurface: { "grid-preview": 1 },
      total: 1,
    });

    registration.release();
    expect(readPublishedStats()).toMatchObject({ total: 0, totalReleased: 1 });
  });

  it("serializes the overBudget flag through the attribute", () => {
    // The registry warns on the budget breach; keep the test output quiet.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setLatencyDebugParam(true);
    initMcapWebGpuDeviceStatsDebugPublisher();

    for (let i = 0; i < WEBGPU_DEVICE_BUDGET; i += 1) {
      registerWebGpuRenderer("grid-preview");
    }
    expect(readPublishedStats()).toMatchObject({ overBudget: false });

    registerWebGpuRenderer("grid-preview");
    expect(readPublishedStats()).toMatchObject({
      overBudget: true,
      total: WEBGPU_DEVICE_BUDGET + 1,
    });
  });

  it("publishes nothing when debug is disabled", () => {
    setLatencyDebugParam(false);
    initMcapWebGpuDeviceStatsDebugPublisher();

    registerWebGpuRenderer("grid-preview");

    expect(readPublishedStats()).toBeNull();
  });

  it("stops publishing after the publisher is stopped", () => {
    setLatencyDebugParam(true);
    initMcapWebGpuDeviceStatsDebugPublisher();
    stopMcapWebGpuDeviceStatsDebugPublisher();
    document.documentElement.removeAttribute(WEBGPU_DEVICE_STATS_ATTRIBUTE);

    registerWebGpuRenderer("grid-preview");

    expect(readPublishedStats()).toBeNull();
  });
});
