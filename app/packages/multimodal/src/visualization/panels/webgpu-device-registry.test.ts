import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WEBGPU_DEVICE_BUDGET,
  registerWebGpuRenderer,
  resetWebGpuDeviceRegistryForTests,
  subscribeWebGpuDeviceStats,
  webGpuDeviceStats,
} from "./webgpu-device-registry";

beforeEach(() => {
  resetWebGpuDeviceRegistryForTests();
});

afterEach(() => {
  resetWebGpuDeviceRegistryForTests();
  vi.restoreAllMocks();
});

describe("webgpu-device-registry", () => {
  it("counts registrations and releases", () => {
    const first = registerWebGpuRenderer("modal-3d");
    const second = registerWebGpuRenderer("modal-3d");

    expect(webGpuDeviceStats()).toMatchObject({
      total: 2,
      totalRegistered: 2,
      totalReleased: 0,
    });

    first.release();
    second.release();

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalRegistered: 2,
      totalReleased: 2,
    });
  });

  it("ignores repeated releases of the same registration", () => {
    const registration = registerWebGpuRenderer("modal-image");

    registration.release();
    registration.release();
    registration.release();

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalReleased: 1,
    });
  });

  it("splits live counts per surface and drops empty surfaces", () => {
    const modal = registerWebGpuRenderer("modal-3d");
    registerWebGpuRenderer("grid-preview");
    registerWebGpuRenderer("grid-preview");

    expect(webGpuDeviceStats().bySurface).toEqual({
      "grid-preview": 2,
      "modal-3d": 1,
    });

    modal.release();

    expect(webGpuDeviceStats().bySurface).toEqual({ "grid-preview": 2 });
  });

  it("keeps the high-water mark after releases", () => {
    const registrations = [
      registerWebGpuRenderer("grid-preview"),
      registerWebGpuRenderer("grid-preview"),
      registerWebGpuRenderer("grid-preview"),
    ];
    for (const registration of registrations) {
      registration.release();
    }
    registerWebGpuRenderer("grid-preview");

    expect(webGpuDeviceStats()).toMatchObject({
      highWaterMark: 3,
      total: 1,
    });
  });

  it("warns once, throttled, when registrations exceed the budget", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    for (let i = 0; i < WEBGPU_DEVICE_BUDGET; i += 1) {
      registerWebGpuRenderer("grid-preview");
    }
    expect(warn).not.toHaveBeenCalled();
    expect(webGpuDeviceStats().overBudget).toBe(false);

    registerWebGpuRenderer("grid-preview");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(webGpuDeviceStats().overBudget).toBe(true);

    // Further breaches inside the throttle window stay silent.
    registerWebGpuRenderer("grid-preview");
    registerWebGpuRenderer("modal-3d");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("notifies subscribers on every register and release", () => {
    const seen: Array<{ total: number; totalReleased: number }> = [];
    const unsubscribe = subscribeWebGpuDeviceStats((stats) => {
      seen.push({ total: stats.total, totalReleased: stats.totalReleased });
    });

    const registration = registerWebGpuRenderer("modal-3d");
    registration.release();

    expect(seen).toEqual([
      { total: 1, totalReleased: 0 },
      { total: 0, totalReleased: 1 },
    ]);

    unsubscribe();
    registerWebGpuRenderer("modal-3d");
    expect(seen).toHaveLength(2);
  });

  it("keeps bookkeeping intact when a subscriber throws", () => {
    subscribeWebGpuDeviceStats(() => {
      throw new Error("observer bug");
    });

    const registration = registerWebGpuRenderer("modal-3d");
    registration.release();

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalRegistered: 1,
      totalReleased: 1,
    });
  });

  it("resets counters, subscribers, and warn throttling for tests", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const subscriber = vi.fn();
    subscribeWebGpuDeviceStats(subscriber);
    for (let i = 0; i <= WEBGPU_DEVICE_BUDGET; i += 1) {
      registerWebGpuRenderer("grid-preview");
    }
    expect(warn).toHaveBeenCalledTimes(1);

    resetWebGpuDeviceRegistryForTests();

    expect(webGpuDeviceStats()).toMatchObject({
      bySurface: {},
      highWaterMark: 0,
      total: 0,
      totalRegistered: 0,
      totalReleased: 0,
    });

    subscriber.mockClear();
    for (let i = 0; i <= WEBGPU_DEVICE_BUDGET; i += 1) {
      registerWebGpuRenderer("grid-preview");
    }
    // The throttle window reset too, so the fresh breach warns again; the
    // cleared subscriber list means the old subscriber stays silent.
    expect(warn).toHaveBeenCalledTimes(2);
    expect(subscriber).not.toHaveBeenCalled();
  });
});
