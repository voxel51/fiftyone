import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { forwardRef, useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebGpuCanvas } from "./webgpu-canvas";
import {
  resetWebGpuDeviceRegistryForTests,
  webGpuDeviceStats,
} from "./webgpu-device-registry";

interface FakeRenderer {
  readonly disposeCalls: number;
  onDeviceLost?: (info: {
    readonly api?: string;
    readonly message?: string;
    readonly reason?: string | null;
  }) => void;
}

const harness = vi.hoisted(() => ({
  initMode: "resolve" as "resolve" | "reject" | "manual",
  pendingInits: [] as Array<() => void>,
  renderers: [] as Array<{ disposeCalls: number }>,
}));

// Minimal stand-in for three's WebGPU renderer: just enough surface for
// webgpu-canvas's construction, init lifecycle, setSize clamp wrapper,
// and prepareWebGpuRenderer color/compat setup. `initMode` drives the
// init promise so tests can exercise success, failure, and the
// unmount-while-pending race.
vi.mock("three/webgpu", () => {
  class FakeWebGPURenderer {
    disposeCalls = 0;
    outputColorSpace = "";

    constructor() {
      harness.renderers.push(this);
    }

    dispose() {
      this.disposeCalls += 1;
    }

    getMaxAnisotropy() {
      return 1;
    }

    init(): Promise<void> {
      if (harness.initMode === "reject") {
        return Promise.reject(new Error("init failed"));
      }
      if (harness.initMode === "manual") {
        return new Promise((resolve) => {
          harness.pendingInits.push(resolve);
        });
      }
      return Promise.resolve();
    }

    setClearColor() {
      // noop: color state is irrelevant to registration bookkeeping
    }

    setSize() {
      // noop: sizing is irrelevant to registration bookkeeping
    }
  }

  return { SRGBColorSpace: "srgb", WebGPURenderer: FakeWebGPURenderer };
});

// Stand-in for the R3F Canvas: like the real one, it invokes the `gl`
// factory exactly once per mount with a canvas element and then reports
// the created state, which is all webgpu-canvas relies on here.
// forwardRef mirrors the real Canvas so the component's ref pass-through
// stays warning-free.
vi.mock("@react-three/fiber", () => ({
  Canvas: forwardRef(function MockCanvas(
    {
      children,
      "data-webgpu-surface": webGpuSurface,
      gl,
      onCreated,
    }: {
      readonly children?: ReactNode;
      readonly "data-webgpu-surface"?: string;
      readonly gl?: (canvas: HTMLCanvasElement) => unknown;
      readonly onCreated?: (state: unknown) => void;
    },
    _ref: unknown,
  ) {
    const createdRef = useRef(false);
    // This effect emulates R3F Canvas construction: run the gl factory
    // once on mount, then surface the created root state.
    useEffect(() => {
      if (createdRef.current) {
        return;
      }
      createdRef.current = true;
      const renderer = gl?.(document.createElement("canvas"));
      onCreated?.({ gl: renderer, invalidate: () => undefined });
    }, [gl, onCreated]);

    return (
      <div data-testid="mock-r3f-canvas" data-webgpu-surface={webGpuSurface}>
        {children}
      </div>
    );
  }),
}));

beforeEach(() => {
  resetWebGpuDeviceRegistryForTests();
  harness.initMode = "resolve";
  harness.pendingInits = [];
  harness.renderers = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WebGpuCanvas device registration", () => {
  it("registers on construction and releases on unmount", async () => {
    const { unmount } = render(
      <WebGpuCanvas surface="test-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );

    expect(webGpuDeviceStats()).toMatchObject({
      bySurface: { "test-surface": 1 },
      total: 1,
    });
    expect(
      document.querySelector('[data-webgpu-surface="test-surface"]'),
    ).not.toBeNull();

    // Children render only after init resolves, so this pins the happy
    // path (init completed while mounted) before unmounting.
    await screen.findByTestId("scene-child");

    unmount();

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalRegistered: 1,
      totalReleased: 1,
    });
    expect(latestRenderer().disposeCalls).toBe(1);
  });

  it("tags the default surface when none is provided", () => {
    render(
      <WebGpuCanvas>
        <div />
      </WebGpuCanvas>,
    );

    expect(webGpuDeviceStats().bySurface).toEqual({ unknown: 1 });
  });

  it("releases when init fails", async () => {
    harness.initMode = "reject";
    const onError = vi.fn();

    render(
      <WebGpuCanvas onError={onError} surface="fail-surface">
        <div />
      </WebGpuCanvas>,
    );

    expect(webGpuDeviceStats().total).toBe(1);

    await waitFor(() => expect(onError).toHaveBeenCalledWith("init failed"));

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalRegistered: 1,
      totalReleased: 1,
    });
    expect(latestRenderer().disposeCalls).toBe(1);
  });

  it("releases exactly once when unmount races a pending init", async () => {
    harness.initMode = "manual";

    const { unmount } = render(
      <WebGpuCanvas surface="pending-surface">
        <div />
      </WebGpuCanvas>,
    );

    expect(webGpuDeviceStats().total).toBe(1);

    // Unmount before init settles: the unmount effect disposes and
    // releases the renderer immediately.
    unmount();

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalReleased: 1,
    });
    expect(latestRenderer().disposeCalls).toBe(1);

    // Now the pending init resolves: the superseded-renderer guard
    // disposes again, but the instance-keyed registration must not
    // double-release.
    for (const resolveInit of harness.pendingInits) {
      resolveInit();
    }
    await waitFor(() => expect(latestRenderer().disposeCalls).toBe(2));

    expect(webGpuDeviceStats()).toMatchObject({
      total: 0,
      totalRegistered: 1,
      totalReleased: 1,
    });
  });

  it("surfaces device loss and releases the renderer registration", async () => {
    const onError = vi.fn();
    render(
      <WebGpuCanvas onError={onError} surface="loss-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );
    await screen.findByTestId("scene-child");

    latestRenderer().onDeviceLost?.({
      api: "WebGPU",
      message: "adapter reset",
      reason: "unknown",
    });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "WebGPU device lost (unknown): adapter reset",
      ),
    );
    expect(screen.queryByTestId("scene-child")).toBeNull();
    expect(webGpuDeviceStats().total).toBe(0);
  });
});

function latestRenderer(): FakeRenderer {
  const renderer = harness.renderers.at(-1);
  if (!renderer) {
    throw new Error("no fake renderer was constructed");
  }
  return renderer;
}
