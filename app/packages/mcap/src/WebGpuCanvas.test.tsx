/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebGpuCanvas } from "./WebGpuCanvas";

const {
  currentRect,
  configureRootMock,
  renderRootMock,
  resizeObserverCallbacks,
  unmountRootMock,
  createRootMock,
  extendMock,
  invalidateMock,
  setSizeMock,
  webGpuRendererInstances,
  webGpuRendererInitMock,
  webGpuRendererDisposeMock,
} = vi.hoisted(() => ({
  currentRect: {
    width: 640,
    height: 480,
    top: 0,
    left: 0,
    bottom: 480,
    right: 640,
    x: 0,
    y: 0,
  },
  configureRootMock: vi.fn(),
  renderRootMock: vi.fn(),
  resizeObserverCallbacks: [] as ResizeObserverCallback[],
  unmountRootMock: vi.fn(),
  createRootMock: vi.fn(),
  extendMock: vi.fn(),
  invalidateMock: vi.fn(),
  setSizeMock: vi.fn(),
  webGpuRendererInstances: [] as unknown[],
  webGpuRendererInitMock: vi.fn(),
  webGpuRendererDisposeMock: vi.fn(),
}));

vi.mock("@react-three/fiber", () => ({
  createRoot: (...args: unknown[]) => createRootMock(...args),
  events: vi.fn(),
  extend: (...args: unknown[]) => extendMock(...args),
}));

vi.mock("three/webgpu", () => ({
  WebGPURenderer: class MockWebGpuRenderer {
    backend = { isWebGPUBackend: true };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      webGpuRendererInstances.push(this);
    }

    options: Record<string, unknown>;

    init() {
      return webGpuRendererInitMock();
    }

    getMaxAnisotropy() {
      return 8;
    }

    dispose() {
      return webGpuRendererDisposeMock();
    }
  },
}));

describe("WebGpuCanvas", () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    resizeObserverCallbacks.length = 0;
    Object.assign(currentRect, {
      width: 640,
      height: 480,
      top: 0,
      left: 0,
      bottom: 480,
      right: 640,
      x: 0,
      y: 0,
    });

    createRootMock.mockReturnValue({
      configure: configureRootMock,
      render: renderRootMock,
      unmount: unmountRootMock,
    });
    renderRootMock.mockReturnValue({
      getState: () => ({
        invalidate: invalidateMock,
        setSize: setSizeMock,
      }),
    });

    webGpuRendererInitMock.mockResolvedValue(undefined);

    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class MockResizeObserver {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        resizeObserverCallbacks.push(this.callback);
        this.callback(
          [
            {
              target,
              contentRect: {
                ...currentRect,
                toJSON: () => ({}),
              },
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver
        );
      }

      disconnect() {}

      unobserve() {}
    } as typeof ResizeObserver;

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          ...currentRect,
          toJSON: () => ({}),
        } as DOMRect)
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver as typeof ResizeObserver;
    webGpuRendererInstances.length = 0;
  });

  it("creates a Three WebGPU renderer and passes it to the R3F root", async () => {
    render(
      <WebGpuCanvas camera={{ position: [0, 0, 10] }} frameloop="demand">
        <group />
      </WebGpuCanvas>
    );

    await waitFor(() => {
      expect(webGpuRendererInitMock).toHaveBeenCalledTimes(1);
      expect(createRootMock).toHaveBeenCalledTimes(1);
      expect(configureRootMock).toHaveBeenCalled();
      expect(renderRootMock).toHaveBeenCalledTimes(1);
    });

    expect(extendMock).toHaveBeenCalledTimes(1);
    expect(webGpuRendererInstances).toHaveLength(1);
    const rendererConfigureCall = configureRootMock.mock.calls.find(
      ([config]) =>
        (config as { gl?: unknown } | undefined)?.gl ===
        webGpuRendererInstances[0]
    );
    expect(rendererConfigureCall?.[0]).toMatchObject({
      camera: { position: [0, 0, 10] },
      frameloop: "demand",
      gl: webGpuRendererInstances[0],
      orthographic: false,
    });
    expect(
      (
        webGpuRendererInstances[0] as {
          capabilities?: { getMaxAnisotropy?: () => number };
        }
      ).capabilities?.getMaxAnisotropy?.()
    ).toBeDefined();
  });

  it("updates the mounted root size on resize without remounting", async () => {
    render(
      <WebGpuCanvas camera={{ position: [0, 0, 10] }} frameloop="demand">
        <group />
      </WebGpuCanvas>
    );

    await waitFor(() => {
      expect(webGpuRendererInitMock).toHaveBeenCalledTimes(1);
      expect(renderRootMock).toHaveBeenCalledTimes(1);
    });

    expect(setSizeMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();

    act(() => {
      Object.assign(currentRect, {
        width: 320,
        height: 240,
        top: 12,
        left: 18,
        bottom: 252,
        right: 338,
        x: 18,
        y: 12,
      });

      resizeObserverCallbacks.forEach((callback) => {
        callback([] as ResizeObserverEntry[], {} as ResizeObserver);
      });
    });

    await waitFor(() => {
      expect(setSizeMock).toHaveBeenCalledWith(320, 240, false, 12, 18);
      expect(invalidateMock).toHaveBeenCalledTimes(1);
    });

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(configureRootMock).toHaveBeenCalledTimes(1);
    expect(renderRootMock).toHaveBeenCalledTimes(1);
  });

  it("disposes the renderer and unmounts the root when removed", async () => {
    const { unmount } = render(
      <WebGpuCanvas>
        <group />
      </WebGpuCanvas>
    );

    await waitFor(() => {
      expect(webGpuRendererInitMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(unmountRootMock).toHaveBeenCalledTimes(1);
      expect(webGpuRendererDisposeMock).toHaveBeenCalledTimes(1);
    });
  });
});
