import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { forwardRef, StrictMode, useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebGpuCanvas } from "./WebGpuCanvas";
import {
  graphicsRendererStats,
  resetGraphicsRendererRegistryForTests,
} from "./graphics-renderer-registry";
import { useGraphicsRuntime } from "./graphics-runtime-context";

interface FakeRenderer {
  readonly backend: {
    readonly isWebGLBackend?: boolean;
    readonly isWebGPUBackend?: boolean;
  };
  readonly disposeCalls: number;
  onDeviceLost?: (info: {
    readonly api?: string;
    readonly message?: string;
    readonly reason?: string | null;
  }) => void;
}

const harness = vi.hoisted(() => ({
  backend: "webgpu" as "webgl2" | "webgpu",
  glFactories: [] as Array<(canvas: HTMLCanvasElement) => unknown>,
  initMode: "resolve" as "resolve" | "reject" | "manual" | "manual-reject",
  pendingInitRejects: [] as Array<(error: unknown) => void>,
  pendingInits: [] as Array<() => void>,
  rendererOptions: [] as Array<{
    readonly antialias?: boolean;
    readonly forceWebGL?: boolean;
  }>,
  renderers: [] as Array<FakeRenderer & { disposeCalls: number }>,
}));

// Minimal stand-in for three's WebGPU renderer: just enough surface for
// webgpu-canvas's construction, init lifecycle, setSize clamp wrapper,
// and prepareWebGpuRenderer color/compat setup. `initMode` drives the
// init promise so tests can exercise success, failure, and the
// unmount-while-pending race.
vi.mock("three/webgpu", () => {
  class FakeWebGPURenderer {
    backend: {
      readonly isWebGLBackend?: boolean;
      readonly isWebGPUBackend?: boolean;
    };
    disposeCalls = 0;
    outputColorSpace = "";

    constructor(options: {
      readonly antialias?: boolean;
      readonly forceWebGL?: boolean;
    }) {
      harness.rendererOptions.push(options);
      harness.renderers.push(this);
      const backend = options.forceWebGL ? "webgl2" : harness.backend;
      this.backend =
        backend === "webgpu"
          ? { isWebGPUBackend: true }
          : { isWebGLBackend: true };
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
      if (harness.initMode === "manual-reject") {
        return new Promise((_resolve, reject) => {
          harness.pendingInitRejects.push(reject);
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
      "data-graphics-backend": graphicsBackend,
      "data-graphics-surface": graphicsSurface,
      "data-webgpu-surface": webGpuSurface,
      gl,
      onCreated,
    }: {
      readonly children?: ReactNode;
      readonly "data-graphics-backend"?: string;
      readonly "data-graphics-surface"?: string;
      readonly "data-webgpu-surface"?: string;
      readonly gl?: (canvas: HTMLCanvasElement) => unknown;
      readonly onCreated?: (state: unknown) => void;
    },
    _ref: unknown,
  ) {
    const createdRef = useRef(false);
    const glRef = useRef(gl);
    const onCreatedRef = useRef(onCreated);
    glRef.current = gl;
    onCreatedRef.current = onCreated;
    // This effect emulates R3F Canvas construction: run the gl factory
    // once on mount, then surface the created root state.
    useEffect(() => {
      if (createdRef.current) {
        return;
      }
      createdRef.current = true;
      if (glRef.current) {
        harness.glFactories.push(glRef.current);
      }
      const renderer = glRef.current?.(document.createElement("canvas"));
      onCreatedRef.current?.({ gl: renderer, invalidate: () => undefined });
      return () => {
        // R3F recreates its root renderer when StrictMode replays effects.
        createdRef.current = false;
      };
    }, []);

    return (
      <div
        data-graphics-backend={graphicsBackend}
        data-graphics-surface={graphicsSurface}
        data-testid="mock-r3f-canvas"
        data-webgpu-surface={webGpuSurface}
      >
        {children}
      </div>
    );
  }),
}));

beforeEach(() => {
  resetGraphicsRendererRegistryForTests();
  harness.backend = "webgpu";
  harness.glFactories = [];
  harness.initMode = "resolve";
  harness.pendingInitRejects = [];
  harness.pendingInits = [];
  harness.rendererOptions = [];
  harness.renderers = [];
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", window.location.pathname);
  vi.restoreAllMocks();
});

describe("WebGpuCanvas device registration", () => {
  it("uses antialiasing by default and allows a surface to disable it", () => {
    const { unmount } = render(
      <WebGpuCanvas>
        <div />
      </WebGpuCanvas>,
    );
    expect(harness.rendererOptions.at(-1)?.antialias).toBe(true);

    unmount();
    render(
      <WebGpuCanvas antialias={false}>
        <div />
      </WebGpuCanvas>,
    );
    expect(harness.rendererOptions.at(-1)?.antialias).toBe(false);
  });

  it("registers on construction and releases on unmount", async () => {
    const { unmount } = render(
      <WebGpuCanvas surface="test-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );

    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        bySurface: {
          "test-surface": { initializing: 1, webgl2: 0, webgpu: 0 },
        },
        live: 1,
      },
      webGpuDevices: { live: 0, reserved: 1 },
    });
    expect(
      document.querySelector('[data-webgpu-surface="test-surface"]'),
    ).not.toBeNull();

    // Children render only after init resolves, so this pins the happy
    // path (init completed while mounted) before unmounting.
    await screen.findByTestId("scene-child");

    unmount();

    expect(graphicsRendererStats()).toMatchObject({
      renderers: { created: 1, disposed: 1, live: 0 },
      webGpuDevices: { live: 0, reserved: 0 },
    });
    expect(latestRenderer().disposeCalls).toBe(1);
  });

  it("accepts async initialization after StrictMode replays effects", async () => {
    harness.initMode = "manual";
    render(
      <StrictMode>
        <WebGpuCanvas surface="strict-surface">
          <RuntimeSurface />
        </WebGpuCanvas>
      </StrictMode>,
    );

    expect(harness.pendingInits).toHaveLength(2);
    for (const resolveInit of harness.pendingInits) {
      resolveInit();
    }

    expect((await screen.findByTestId("runtime-surface")).textContent).toBe(
      "strict-surface",
    );
    expect(latestRenderer().disposeCalls).toBe(0);
  });

  it("tags the default surface when none is provided", () => {
    render(
      <WebGpuCanvas>
        <div />
      </WebGpuCanvas>,
    );

    expect(graphicsRendererStats().renderers.bySurface).toEqual({
      unknown: { initializing: 1, webgl2: 0, webgpu: 0 },
    });
  });

  it("keeps one surface identity when props change during initialization", async () => {
    harness.initMode = "manual";
    const { rerender } = render(
      <WebGpuCanvas surface="initial-surface">
        <RuntimeSurface />
      </WebGpuCanvas>,
    );

    rerender(
      <WebGpuCanvas surface="changed-surface">
        <RuntimeSurface />
      </WebGpuCanvas>,
    );
    expect(
      screen
        .getByTestId("mock-r3f-canvas")
        .getAttribute("data-graphics-surface"),
    ).toBe("initial-surface");

    for (const resolveInit of harness.pendingInits) {
      resolveInit();
    }
    expect((await screen.findByTestId("runtime-surface")).textContent).toBe(
      "initial-surface",
    );
    expect(graphicsRendererStats().renderers.bySurface).toEqual({
      "initial-surface": { initializing: 0, webgl2: 0, webgpu: 1 },
    });
  });

  it("releases when init fails", async () => {
    harness.initMode = "reject";
    const onError = vi.fn();

    render(
      <WebGpuCanvas onError={onError} surface="fail-surface">
        <div />
      </WebGpuCanvas>,
    );

    expect(graphicsRendererStats().renderers.live).toBe(1);

    await waitFor(() => expect(onError).toHaveBeenCalledWith("init failed"));

    expect(graphicsRendererStats()).toMatchObject({
      lastError: "init failed",
      renderers: { created: 1, disposed: 1, initFailures: 1, live: 0 },
      webGpuDevices: { live: 0, reserved: 0 },
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

    expect(graphicsRendererStats().renderers.live).toBe(1);

    // Unmount before init settles: the unmount effect disposes and
    // releases the renderer immediately.
    unmount();

    expect(graphicsRendererStats()).toMatchObject({
      renderers: { disposed: 1, live: 0 },
    });
    expect(latestRenderer().disposeCalls).toBe(1);

    // Now the pending init resolves: the superseded-renderer guard
    // disposes again, but the instance-keyed registration must not
    // double-release.
    for (const resolveInit of harness.pendingInits) {
      resolveInit();
    }
    await waitFor(() => expect(latestRenderer().disposeCalls).toBe(2));

    expect(graphicsRendererStats()).toMatchObject({
      renderers: { created: 1, disposed: 1, live: 0 },
    });
  });

  it("retires a rejected renderer after it is superseded", async () => {
    harness.initMode = "manual-reject";
    const onError = vi.fn();
    render(
      <WebGpuCanvas onError={onError} surface="superseded-surface">
        <div />
      </WebGpuCanvas>,
    );
    const firstRenderer = latestRenderer();

    harness.initMode = "resolve";
    harness.glFactories.at(-1)?.(document.createElement("canvas"));
    expect(firstRenderer.disposeCalls).toBe(1);
    await waitFor(() =>
      expect(graphicsRendererStats().webGpuDevices.live).toBe(1),
    );
    harness.pendingInitRejects.at(-1)?.(new Error("stale init failed"));

    await waitFor(() => expect(firstRenderer.disposeCalls).toBe(2));
    expect(onError).not.toHaveBeenCalledWith("stale init failed");
    expect(graphicsRendererStats()).toMatchObject({
      lastError: null,
      renderers: { created: 2, disposed: 1, initFailures: 0, live: 1 },
      webGpuDevices: { live: 1, reserved: 0 },
    });
  });

  it("clears a published runtime while its replacement initializes", async () => {
    render(
      <WebGpuCanvas surface="replacement-surface">
        <RuntimeSurface />
      </WebGpuCanvas>,
    );
    expect(await screen.findByTestId("runtime-surface")).not.toBeNull();
    const firstRenderer = latestRenderer();

    harness.initMode = "manual";
    harness.glFactories.at(-1)?.(document.createElement("canvas"));

    await waitFor(() =>
      expect(screen.queryByTestId("runtime-surface")).toBeNull(),
    );
    expect(firstRenderer.disposeCalls).toBe(1);
    expect(graphicsRendererStats()).toMatchObject({
      renderers: { disposed: 1, initializing: 1, live: 1 },
      webGpuDevices: { live: 0, reserved: 1 },
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
    expect(graphicsRendererStats()).toMatchObject({
      renderers: { deviceLosses: 1, disposed: 1, live: 0 },
      webGpuDevices: { live: 0 },
    });
    expect(latestRenderer().disposeCalls).toBe(1);
  });

  it("surfaces WebGL2 context loss in renderer diagnostics", async () => {
    harness.backend = "webgl2";
    const onError = vi.fn();
    render(
      <WebGpuCanvas onError={onError} surface="webgl-loss-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );
    await screen.findByTestId("scene-child");

    latestRenderer().onDeviceLost?.({
      api: "WebGL",
      message: "context reset",
      reason: "unknown",
    });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "WebGL device lost (unknown): context reset",
      ),
    );
    expect(screen.queryByTestId("scene-child")).toBeNull();
    expect(graphicsRendererStats()).toMatchObject({
      lastError: "WebGL device lost (unknown): context reset",
      renderers: {
        byBackend: { webgl2: 0, webgpu: 0 },
        deviceLosses: 1,
        disposed: 1,
        live: 0,
      },
      webGpuDevices: { live: 0 },
    });
    expect(latestRenderer().disposeCalls).toBe(1);
  });

  it("surfaces and records device loss before initialization resolves", async () => {
    harness.initMode = "manual-reject";
    const onError = vi.fn();
    render(
      <WebGpuCanvas onError={onError} surface="initializing-loss-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );

    latestRenderer().onDeviceLost?.({
      api: "WebGPU",
      message: "device removed during init",
      reason: "unknown",
    });

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "WebGPU device lost (unknown): device removed during init",
      ),
    );
    expect(screen.queryByTestId("scene-child")).toBeNull();
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

    harness.pendingInitRejects.at(-1)?.(new Error("late init rejection"));
    await waitFor(() => expect(latestRenderer().disposeCalls).toBe(2));
    expect(graphicsRendererStats()).toMatchObject({
      lastError: "WebGPU device lost (unknown): device removed during init",
      renderers: { deviceLosses: 1, disposed: 1, initFailures: 0 },
    });
  });

  it("publishes WebGL2 and does not count a fallback as a WebGPU device", async () => {
    harness.backend = "webgl2";
    render(
      <WebGpuCanvas surface="fallback-surface">
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );

    await screen.findByTestId("scene-child");
    expect(
      document.querySelector('[data-graphics-backend="webgl2"]'),
    ).not.toBeNull();
    expect(graphicsRendererStats()).toMatchObject({
      renderers: {
        byBackend: { webgl2: 1, webgpu: 0 },
        webGlFallbacks: 1,
      },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });

  it("honors the production diagnostic query for new renderers", async () => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?graphicsBackend=webgl2`,
    );
    render(
      <WebGpuCanvas>
        <div data-testid="scene-child" />
      </WebGpuCanvas>,
    );

    expect(harness.rendererOptions.at(-1)?.forceWebGL).toBe(true);
    expect(graphicsRendererStats().webGpuDevices.reserved).toBe(0);
    await screen.findByTestId("scene-child");
    expect(graphicsRendererStats()).toMatchObject({
      requestedBackend: "webgl2",
      renderers: { webGlFallbacks: 0, webGlOverrides: 1 },
      webGpuDevices: { live: 0, reserved: 0 },
    });
  });
});

function latestRenderer(): FakeRenderer {
  const renderer = harness.renderers.at(-1);
  if (!renderer) {
    throw new Error("no fake renderer was constructed");
  }
  return renderer;
}

function RuntimeSurface() {
  return (
    <div data-testid="runtime-surface">{useGraphicsRuntime().surface}</div>
  );
}
