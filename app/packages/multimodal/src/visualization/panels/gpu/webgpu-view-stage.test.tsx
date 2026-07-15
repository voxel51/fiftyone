import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, type CSSProperties, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canvasMounts: 0,
  invalidate: vi.fn(),
  latestCanvasProps: null as {
    dpr?: number;
    frameloop?: string;
    style?: CSSProperties;
    surface?: string;
  } | null,
  onError: null as ((error: string | null) => void) | null,
}));

vi.mock("./webgpu-canvas", () => ({
  WebGpuCanvas: ({
    children: _children,
    dpr,
    frameloop,
    onError,
    onReady,
    style,
    surface,
  }: {
    readonly children: ReactNode;
    readonly dpr?: number;
    readonly frameloop?: string;
    readonly onError?: (error: string | null) => void;
    readonly onReady?: (state: { invalidate: () => void }) => void;
    readonly style?: CSSProperties;
    readonly surface?: string;
  }) => {
    harness.latestCanvasProps = { dpr, frameloop, style, surface };
    harness.onError = onError ?? null;
    useLayoutEffect(() => {
      harness.canvasMounts += 1;
      onReady?.({ invalidate: harness.invalidate });
    }, [onReady]);
    return <div data-testid="shared-webgpu-canvas" />;
  },
}));

import {
  WebGpuView,
  WebGpuViewStage,
  updateWebGpuViewNodes,
  webGpuViewBounds,
  useWebGpuViewStage,
} from "./webgpu-view-stage";

interface ResizeObserverHarness {
  readonly callback: ResizeObserverCallback;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly observe: ReturnType<typeof vi.fn>;
}

interface IntersectionObserverHarness {
  readonly callback: IntersectionObserverCallback;
  readonly disconnect: ReturnType<typeof vi.fn>;
  readonly observe: ReturnType<typeof vi.fn>;
}

const resizeObservers: ResizeObserverHarness[] = [];
const intersectionObservers: IntersectionObserverHarness[] = [];
let originalIntersectionObserver: typeof IntersectionObserver | undefined;
let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  harness.canvasMounts = 0;
  harness.invalidate.mockReset();
  harness.latestCanvasProps = null;
  harness.onError = null;
  resizeObservers.length = 0;
  intersectionObservers.length = 0;
  originalIntersectionObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class MockIntersectionObserver {
    readonly callback: IntersectionObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      intersectionObservers.push(this);
    }

    root = null;
    rootMargin = "0px";
    thresholds = [0];
    takeRecords = () => [];
    unobserve = vi.fn();
  } as unknown as typeof IntersectionObserver;
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class MockResizeObserver {
    readonly callback: ResizeObserverCallback;
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeObservers.push(this);
    }

    unobserve = vi.fn();
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalIntersectionObserver) {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  } else {
    delete (
      globalThis as {
        IntersectionObserver?: typeof IntersectionObserver;
      }
    ).IntersectionObserver;
  }
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
      .ResizeObserver;
  }
});

describe("WebGpuViewStage", () => {
  it("stays GPU-free until a view registers", () => {
    render(
      <WebGpuViewStage>
        <span>ordinary tile content</span>
      </WebGpuViewStage>,
    );

    expect(screen.getByText("ordinary tile content")).toBeTruthy();
    expect(screen.queryByTestId("shared-webgpu-canvas")).toBeNull();
    expect(harness.canvasMounts).toBe(0);
  });

  it("shares one demand canvas across views and retires it with the last view", async () => {
    const { rerender } = render(<ViewHarness first second />);

    await screen.findByTestId("shared-webgpu-canvas");
    expect(document.querySelectorAll("[data-webgpu-view]")).toHaveLength(2);
    expect(harness.canvasMounts).toBe(1);
    expect(harness.latestCanvasProps).toMatchObject({
      dpr: 1,
      frameloop: "demand",
      surface: "modal-images",
    });
    expect(harness.latestCanvasProps?.style?.pointerEvents).toBe("none");

    rerender(<ViewHarness first second={false} />);
    expect(screen.getByTestId("shared-webgpu-canvas")).toBeTruthy();
    expect(harness.canvasMounts).toBe(1);

    rerender(<ViewHarness first={false} second={false} />);
    await waitFor(() =>
      expect(screen.queryByTestId("shared-webgpu-canvas")).toBeNull(),
    );
  });

  it("tracks browser DPR changes within the supported 1x-2x range", async () => {
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    try {
      render(<ViewHarness first second={false} />);

      await waitFor(() => expect(harness.latestCanvasProps?.dpr).toBe(2));

      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: 3,
      });
      fireWindowResize();
      await waitFor(() => expect(harness.latestCanvasProps?.dpr).toBe(2));

      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: 1,
      });
      fireWindowResize();
      await waitFor(() => expect(harness.latestCanvasProps?.dpr).toBe(1));
    } finally {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: originalDpr,
      });
    }
  });

  it("invalidates after canvas readiness and tracked DOM resizes", async () => {
    render(<ViewHarness first second={false} />);

    await screen.findByTestId("shared-webgpu-canvas");
    expect(harness.invalidate).toHaveBeenCalled();
    const callsBeforeResize = harness.invalidate.mock.calls.length;

    act(() => {
      for (const observer of resizeObservers) {
        observer.callback([], observer as unknown as ResizeObserver);
      }
    });

    expect(harness.invalidate.mock.calls.length).toBeGreaterThan(
      callsBeforeResize,
    );
    expect(resizeObservers).toHaveLength(2);
    expect(
      resizeObservers.every(
        (observer) => observer.observe.mock.calls.length > 0,
      ),
    ).toBe(true);
  });

  it("tracks a view moving without a resize", async () => {
    render(<ViewHarness first second={false} />);
    await screen.findByTestId("shared-webgpu-canvas");
    const callsBeforeMove = harness.invalidate.mock.calls.length;

    act(() => {
      for (const observer of intersectionObservers) {
        observer.callback(
          [
            {
              boundingClientRect: {
                bottom: 300,
                height: 240,
                left: 40,
                right: 360,
                top: 60,
                width: 320,
                x: 40,
                y: 60,
              } as DOMRectReadOnly,
            } as IntersectionObserverEntry,
          ],
          observer as unknown as IntersectionObserver,
        );
      }
    });

    expect(harness.invalidate.mock.calls.length).toBeGreaterThan(
      callsBeforeMove,
    );
    expect(intersectionObservers).toHaveLength(1);
    expect(intersectionObservers[0].observe).toHaveBeenCalledOnce();
  });

  it("publishes renderer readiness and errors through stage context", async () => {
    const { rerender } = render(
      <WebGpuViewStage>
        <StageState />
        <WebGpuView>
          <span>scene</span>
        </WebGpuView>
      </WebGpuViewStage>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("stage-state").dataset.ready).toBe("true"),
    );
    expect(screen.getByTestId("stage-state").dataset.error).toBe("");

    act(() => harness.onError?.("device unavailable"));

    expect(screen.getByTestId("stage-state").dataset.ready).toBe("false");
    expect(screen.getByTestId("stage-state").dataset.error).toBe(
      "device unavailable",
    );
    expect(screen.queryByTestId("shared-webgpu-canvas")).toBeNull();

    rerender(
      <WebGpuViewStage>
        <StageState />
      </WebGpuViewStage>,
    );
    expect(screen.getByTestId("stage-state").dataset.error).toBe(
      "device unavailable",
    );

    rerender(
      <WebGpuViewStage>
        <StageState />
        <WebGpuView>
          <span>retry scene</span>
        </WebGpuView>
      </WebGpuViewStage>,
    );
    expect(screen.queryByTestId("shared-webgpu-canvas")).toBeNull();
    expect(harness.canvasMounts).toBe(1);
  });
});

describe("webGpuViewBounds", () => {
  const canvas = {
    height: 600,
    left: 100,
    top: 50,
    width: 800,
  } as Parameters<typeof webGpuViewBounds>[0];

  it("uses WebGPU's top-left origin without mirroring vertical views", () => {
    expect(
      webGpuViewBounds(
        canvas,
        rect({ height: 250, left: 120, top: 80, width: 300 }),
      ),
    ).toMatchObject({
      height: 250,
      scissorHeight: 250,
      scissorWidth: 300,
      scissorX: 20,
      scissorY: 30,
      viewportX: 20,
      viewportY: 30,
      width: 300,
    });
  });

  it("skips partially visible, hidden, or empty views", () => {
    expect(
      webGpuViewBounds(
        canvas,
        rect({ height: 200, left: 50, top: 0, width: 200 }),
      ),
    ).toBeNull();
    expect(
      webGpuViewBounds(
        canvas,
        rect({ height: 100, left: -500, top: 0, width: 100 }),
      ),
    ).toBeNull();
    expect(
      webGpuViewBounds(
        canvas,
        rect({ height: 0, left: 100, top: 50, width: 100 }),
      ),
    ).toBeNull();
  });
});

describe("shared view identity", () => {
  it("updates one view without reordering or reassigning sibling scenes", () => {
    const firstA = <span>camera a frame 1</span>;
    const secondA = <span>camera a frame 2</span>;
    const cameraB = <span>camera b</span>;
    let nodes: ReadonlyMap<string, ReactNode> = new Map();
    nodes = updateWebGpuViewNodes(nodes, "camera-a", firstA);
    nodes = updateWebGpuViewNodes(nodes, "camera-b", cameraB);
    nodes = updateWebGpuViewNodes(nodes, "camera-a", secondA);

    expect(Array.from(nodes.keys())).toEqual(["camera-a", "camera-b"]);
    expect(nodes.get("camera-a")).toBe(secondA);
    expect(nodes.get("camera-b")).toBe(cameraB);
  });
});

function ViewHarness({
  first,
  second,
}: {
  readonly first: boolean;
  readonly second: boolean;
}) {
  return (
    <WebGpuViewStage>
      {first ? (
        <WebGpuView>
          <span>first scene</span>
        </WebGpuView>
      ) : null}
      {second ? (
        <WebGpuView>
          <span>second scene</span>
        </WebGpuView>
      ) : null}
    </WebGpuViewStage>
  );
}

function StageState() {
  const stage = useWebGpuViewStage();
  return (
    <div
      data-error={stage?.error ?? ""}
      data-ready={String(stage?.ready ?? false)}
      data-testid="stage-state"
    />
  );
}

function fireWindowResize() {
  act(() => window.dispatchEvent(new Event("resize")));
}

function rect({
  height,
  left,
  top,
  width,
}: {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}): Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width"> {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}
