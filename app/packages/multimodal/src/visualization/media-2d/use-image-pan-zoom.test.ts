import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  nextImageViewTransformForWheel,
  useImagePanZoom,
} from "./use-image-pan-zoom";

describe("nextImageViewTransformForWheel", () => {
  it("zooms in for negative wheel deltas", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        -100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1.045, translateX: 0, translateY: 0 });
  });

  it("zooms out for positive wheel deltas", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1.045, translateX: 0, translateY: 0 },
        100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("zooms out from the default fitted scale", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1 / 1.045, translateX: 0, translateY: 0 });
  });

  it("keeps the cursor anchored while zooming in", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        -100,
        { x: 80, y: -40 },
      ),
    ).toEqual({
      scale: 1.045,
      translateX: 80 - 80 * 1.045,
      translateY: -40 - -40 * 1.045,
    });
  });

  it("keeps the pointer anchored while zooming out", () => {
    const next = nextImageViewTransformForWheel(
      { scale: 2, translateX: 40, translateY: -20 },
      100,
      { x: 100, y: 50 },
    );

    expect(next.scale).toBeCloseTo(2 / 1.045);
    expect(next.translateX).toBeCloseTo(100 - (100 - 40) / 1.045);
    expect(next.translateY).toBeCloseTo(50 - (50 + 20) / 1.045);
  });
});

describe("useImagePanZoom drag capture", () => {
  beforeEach(() => {
    // Immediate-fire ResizeObserver so the surface gets a size and the
    // hook becomes interactive synchronously.
    global.ResizeObserver = class MockResizeObserver {
      private readonly cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        this.cb(
          [
            {
              contentRect: { width: 400, height: 300 },
              target: el,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;
  });

  function pointerEvent(overrides: {
    clientX: number;
    clientY: number;
    currentTarget: unknown;
  }) {
    return {
      button: 0,
      pointerId: 1,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as React.PointerEvent<HTMLDivElement>;
  }

  function interactiveHook() {
    const rendered = renderHook(() =>
      useImagePanZoom({
        fit: "contain",
        imageSize: { height: 100, width: 200 },
        resetKey: "k",
      }),
    );
    act(() => {
      rendered.result.current.surfaceRef(document.createElement("div"));
    });
    return rendered;
  }

  it("does not capture the pointer for a click-sized gesture", () => {
    const { result } = interactiveHook();
    const surface = {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    };

    act(() => {
      result.current.onPointerDown(
        pointerEvent({ clientX: 10, clientY: 10, currentTarget: surface }),
      );
      result.current.onPointerMove(
        pointerEvent({ clientX: 12, clientY: 11, currentTarget: surface }),
      );
      result.current.onPointerUp(
        pointerEvent({ clientX: 12, clientY: 11, currentTarget: surface }),
      );
    });

    // Capturing here would retarget pointerup at the surface and swallow
    // click events on annotation shapes.
    expect(surface.setPointerCapture).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it("captures and starts dragging once the threshold is passed", () => {
    const { result } = interactiveHook();
    const surface = {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    };

    act(() => {
      result.current.onPointerDown(
        pointerEvent({ clientX: 10, clientY: 10, currentTarget: surface }),
      );
      result.current.onPointerMove(
        pointerEvent({ clientX: 30, clientY: 10, currentTarget: surface }),
      );
    });
    expect(surface.setPointerCapture).toHaveBeenCalledWith(1);
    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.onPointerUp(
        pointerEvent({ clientX: 30, clientY: 10, currentTarget: surface }),
      );
    });
    expect(surface.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(result.current.isDragging).toBe(false);
  });
});
