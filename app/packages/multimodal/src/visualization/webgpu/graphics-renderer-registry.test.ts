import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WEBGPU_DEVICE_BUDGET,
  canAcquireWebGpuDevice,
  graphicsRendererStats,
  registerGraphicsRenderer,
  resetGraphicsRendererRegistryForTests,
  subscribeGraphicsRendererStats,
} from "./graphics-renderer-registry";

beforeEach(resetGraphicsRendererRegistryForTests);
afterEach(() => {
  resetGraphicsRendererRegistryForTests();
  vi.restoreAllMocks();
});

describe("graphics-renderer-registry", () => {
  it("starts as an initializing renderer and WebGPU reservation", () => {
    const registration = registerGraphicsRenderer("modal-3d");

    expect(registration.state).toBe("initializing");
    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        byBackend: { webgl2: 0, webgpu: 0 },
        bySurface: {
          "modal-3d": { initializing: 1, webgl2: 0, webgpu: 0 },
        },
        created: 1,
        initializing: 1,
        live: 1,
      },
      webGpuDevices: { live: 0, reserved: 1 },
    });
  });

  it("resolves one request to exactly one backend", () => {
    const webGpu = registerGraphicsRenderer("modal-3d");
    const webGl = registerGraphicsRenderer("modal-image");

    webGpu.markReady("webgpu");
    webGl.markReady("webgl2");
    webGl.markReady("webgpu");

    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        byBackend: { webgl2: 1, webgpu: 1 },
        initializing: 0,
        webGlFallbacks: 1,
      },
      webGpuDevices: { live: 1, reserved: 0 },
    });
  });

  it("does not reserve WebGPU or report a fallback for a diagnostic override", () => {
    const registration = registerGraphicsRenderer("modal-3d", "webgl2");

    expect(graphicsRendererStats()).toMatchObject({
      renderers: { initializing: 1 },
      webGpuDevices: { reserved: 0 },
    });
    expect(canAcquireWebGpuDevice("grid-live")).toBe(true);

    registration.markReady("webgl2");
    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        byBackend: { webgl2: 1, webgpu: 0 },
        webGlFallbacks: 0,
        webGlOverrides: 1,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("records initialization failure after releasing its reservation", () => {
    const registration = registerGraphicsRenderer("modal-3d");
    registration.markFailed({ message: "adapter unavailable" });
    registration.release();

    expect(graphicsRendererStats()).toMatchObject({
      lastError: "adapter unavailable",
      renderers: {
        disposed: 1,
        initFailures: 1,
        initializing: 0,
        live: 0,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("records device loss and decrements the live device exactly once", () => {
    const registration = registerGraphicsRenderer("modal-3d");
    registration.markReady("webgpu");
    registration.markLost({
      api: "WebGPU",
      message: "adapter reset",
      reason: "unknown",
    });
    registration.markLost("duplicate");
    registration.release();
    registration.release();

    expect(graphicsRendererStats()).toMatchObject({
      lastError: "WebGPU device lost (unknown): adapter reset",
      renderers: { deviceLosses: 1, disposed: 1, live: 0 },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("records WebGL2 context loss and decrements the live renderer", () => {
    const registration = registerGraphicsRenderer("modal-image");
    registration.markReady("webgl2");
    registration.markLost({
      api: "WebGL",
      message: "context reset",
      reason: "unknown",
    });
    registration.markLost("duplicate");
    registration.release();

    expect(graphicsRendererStats()).toMatchObject({
      lastError: "WebGL device lost (unknown): context reset",
      renderers: {
        byBackend: { webgl2: 0, webgpu: 0 },
        deviceLosses: 1,
        disposed: 1,
        live: 0,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("records device loss while initialization still owns a reservation", () => {
    const registration = registerGraphicsRenderer("modal-image");
    registration.markLost({
      api: "WebGPU",
      message: "device removed during init",
      reason: "unknown",
    });
    registration.markFailed(new Error("late init rejection"));
    registration.release();

    expect(graphicsRendererStats()).toMatchObject({
      lastError: "WebGPU device lost (unknown): device removed during init",
      renderers: {
        deviceLosses: 1,
        disposed: 1,
        initFailures: 0,
        initializing: 0,
        live: 0,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("releases idempotently from initializing and ready states", () => {
    const initializing = registerGraphicsRenderer("grid-preview");
    const ready = registerGraphicsRenderer("modal-3d");
    ready.markReady("webgl2");

    initializing.release();
    initializing.release();
    ready.release();
    ready.release();

    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        byBackend: { webgl2: 0, webgpu: 0 },
        bySurface: {},
        disposed: 2,
        live: 0,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("budgets initializing plus live WebGPU devices but not WebGL2", () => {
    const registrations = Array.from({ length: WEBGPU_DEVICE_BUDGET - 1 }, () =>
      registerGraphicsRenderer("grid-preview"),
    );
    registrations[0].markReady("webgl2");
    const lastReservation = registerGraphicsRenderer("modal-3d");

    expect(canAcquireWebGpuDevice("grid-live")).toBe(true);
    const finalReservation = registerGraphicsRenderer("modal-image");
    expect(canAcquireWebGpuDevice("grid-live")).toBe(false);
    expect(canAcquireWebGpuDevice("modal")).toBe(true);
    expect(canAcquireWebGpuDevice("snapshot")).toBe(true);

    finalReservation.markReady("webgl2");
    expect(canAcquireWebGpuDevice("grid-live")).toBe(true);
    lastReservation.markReady("webgpu");
    expect(graphicsRendererStats().webGpuDevices.live).toBe(1);
  });

  it("tracks renderer and actual-device high-water marks separately", () => {
    const first = registerGraphicsRenderer("modal-3d");
    const second = registerGraphicsRenderer("modal-image");
    first.markReady("webgpu");
    second.markReady("webgl2");
    first.release();
    second.release();

    expect(graphicsRendererStats()).toMatchObject({
      renderers: { highWaterMark: 2 },
      webGpuDevices: { highWaterMark: 1 },
    });
  });

  it("notifies safe debug subscribers on every lifecycle transition", () => {
    const seen: number[] = [];
    subscribeGraphicsRendererStats((stats) => {
      seen.push(stats.renderers.initializing);
    });
    subscribeGraphicsRendererStats(() => {
      throw new Error("observer bug");
    });

    const registration = registerGraphicsRenderer("modal-3d");
    registration.markReady("webgpu");
    registration.release();

    expect(seen).toEqual([1, 0, 0]);
  });

  it("warns only when reserved-or-live WebGPU devices exceed the budget", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const registrations = Array.from({ length: WEBGPU_DEVICE_BUDGET + 1 }, () =>
      registerGraphicsRenderer("grid-preview"),
    );
    expect(warn).toHaveBeenCalledTimes(1);

    registrations.at(-1)?.markReady("webgl2");
    expect(graphicsRendererStats().webGpuDevices.overBudget).toBe(false);
  });
});
