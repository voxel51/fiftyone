import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BASEMAP_PROVIDER_ERROR_LIMIT,
  BasemapReadinessGate,
  basemapRetryDelayMs,
} from "./basemap-readiness";

afterEach(() => vi.useRealTimers());

describe("BasemapReadinessGate", () => {
  it("fails a provider that remains stuck before its first tile", () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const gate = new BasemapReadinessGate({
      onFailure,
      onReady: vi.fn(),
      sourceIds: ["provider"],
      timeoutMs: 100,
    });

    vi.advanceTimersByTime(99);
    expect(onFailure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith("timeout");
    gate.dispose();
  });

  it("fails only after repeated active-provider errors", () => {
    const onFailure = vi.fn();
    const gate = new BasemapReadinessGate({
      onFailure,
      onReady: vi.fn(),
      sourceIds: ["provider"],
    });

    for (let index = 1; index < BASEMAP_PROVIDER_ERROR_LIMIT; index += 1) {
      gate.handleError({ sourceId: "provider" });
      expect(onFailure).not.toHaveBeenCalled();
    }
    gate.handleError({ sourceId: "provider" });
    gate.handleError({ sourceId: "provider" });
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith("provider-errors");
    gate.dispose();
  });

  it("ignores overlay errors and stays ready after the first provider tile", () => {
    const onFailure = vi.fn();
    const onReady = vi.fn();
    const gate = new BasemapReadinessGate({
      onFailure,
      onReady,
      sourceIds: ["provider"],
    });

    gate.handleError({ sourceId: "episode-location-current" });
    gate.handleSourceData({
      coord: {},
      sourceDataType: "content",
      sourceId: "provider",
    });
    for (let index = 0; index < 10; index += 1) {
      gate.handleError({ sourceId: "provider" });
    }

    expect(onReady).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("cleans its watchdog and exposes bounded retry delays", () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const gate = new BasemapReadinessGate({
      onFailure,
      onReady: vi.fn(),
      sourceIds: ["provider"],
      timeoutMs: 100,
    });
    gate.dispose();
    vi.advanceTimersByTime(100);

    expect(onFailure).not.toHaveBeenCalled();
    expect([0, 1, 2].map(basemapRetryDelayMs)).toEqual([500, 1_500, null]);
  });
});
