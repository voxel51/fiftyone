import { useCropToContentSetting, useModalViewport } from "@fiftyone/state";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import useViewport from "./useViewport";

// Hoisted so vi.mock factories can reference these before module-level code runs
const { mockBus, mockSetViewportState } = vi.hoisted(() => {
  const map = new Map<string, Set<(...args: any[]) => any>>();

  const on = (event: string, handler: (...args: any[]) => any) => {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);
    return () => off(event, handler);
  };

  const off = (event: string, handler: (...args: any[]) => any) => {
    map.get(event)?.delete(handler);
  };

  const once = (event: string, handler: (...args: any[]) => any) => {
    const wrapper = (...args: any[]) => {
      off(event, wrapper);
      return handler(...args);
    };
    return on(event, wrapper);
  };

  // Snapshot handlers at dispatch time to avoid set-mutation issues during iteration
  const dispatch = (event: string, data?: any) =>
    [...(map.get(event) ?? [])].forEach((h) => h(data));

  const clearAll = () => map.clear();

  return {
    mockBus: { on, off, once, dispatch, clearAll },
    mockSetViewportState: vi.fn(),
  };
});

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => mockBus,
}));

vi.mock("@fiftyone/lighter", async () => {
  const { useEffect } = await import("react");
  return {
    useLighter: () => ({
      scene: {
        getEventChannel: () => "test-channel",
        setViewportState: mockSetViewportState,
        getOverlay: () => null,
      },
    }),
    UNDEFINED_LIGHTER_SCENE_ID: "UNDEFINED_LIGHTER_SCENE",
    // Reproduce the real shape: a function that returns a hook
    useLighterEventHandler:
      () =>
      (
        event: string,
        handler: (...args: any[]) => any,
        { once = false } = {}
      ) => {
        useEffect(() => {
          if (once) return mockBus.once(event, handler);
          mockBus.on(event, handler);
          return () => mockBus.off(event, handler);
        }, [event, handler, once]);
      },
  };
});

vi.mock("@fiftyone/lighter/src/core/Scene2D", () => ({
  TypeGuards: { isSpatial: () => false },
}));

vi.mock("@fiftyone/state", () => ({
  useCropToContentSetting: vi.fn(() => [false]),
  useModalViewport: vi.fn(() => null),
}));

// --- Event helpers ---

const OVERLAY_A = "overlay-a";
const OVERLAY_B = "overlay-b";
const BOUNDS = { x: 0, y: 0, width: 100, height: 100 };

const fireOverlayAdded = (id: string) =>
  act(() => mockBus.dispatch("lighter:overlay-added", { id }));

const fireMediaBoundsChanged = (bounds = BOUNDS) =>
  act(() =>
    mockBus.dispatch("lighter:canonical-media-bounds-changed", { bounds })
  );

const fireViewportMoved = () =>
  act(() => mockBus.dispatch("lighter:viewport-moved", undefined));

// --- Tests ---

describe("useViewport", () => {
  beforeEach(() => {
    mockBus.clearAll();
    mockSetViewportState.mockClear();
    vi.mocked(useCropToContentSetting).mockReturnValue([false]);
    vi.mocked(useModalViewport).mockReturnValue(null);
  });

  test("is not ready on initial render", () => {
    const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));
    expect(result.current.ready).toBe(false);
  });

  describe("reveal consistency", () => {
    test("becomes ready only when overlays, media bounds, and viewport have all settled", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      await fireOverlayAdded(OVERLAY_A);
      expect(result.current.ready).toBe(false);

      await fireMediaBoundsChanged();
      expect(result.current.ready).toBe(false);

      await fireViewportMoved();
      expect(result.current.ready).toBe(true);
    });

    test("stays hidden if overlays have not fired", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      await fireMediaBoundsChanged();
      await fireViewportMoved();

      expect(result.current.ready).toBe(false);
    });

    test("stays hidden if media bounds have not been received", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      await fireOverlayAdded(OVERLAY_A);
      await fireViewportMoved();

      expect(result.current.ready).toBe(false);
    });

    test("stays hidden if the viewport has not moved", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      await fireOverlayAdded(OVERLAY_A);
      await fireMediaBoundsChanged();

      expect(result.current.ready).toBe(false);
    });

    test("waits for every overlay in the initial set before revealing", async () => {
      const { result } = renderHook(() =>
        useViewport(new Set([OVERLAY_A, OVERLAY_B]))
      );

      // First overlay fires alongside bounds and viewport — still missing second overlay
      await fireOverlayAdded(OVERLAY_A);
      await fireMediaBoundsChanged();
      await fireViewportMoved();
      expect(result.current.ready).toBe(false);

      // Second overlay completes the set — all three gates now satisfied
      await fireOverlayAdded(OVERLAY_B);
      expect(result.current.ready).toBe(true);
    });

    test("ignores overlay-added events for ids outside the initial set", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      await fireOverlayAdded("unknown-overlay");
      await fireMediaBoundsChanged();
      await fireViewportMoved();
      expect(result.current.ready).toBe(false);

      await fireOverlayAdded(OVERLAY_A);
      expect(result.current.ready).toBe(true);
    });

    test("becomes ready regardless of event arrival order", async () => {
      const { result } = renderHook(() => useViewport(new Set([OVERLAY_A])));

      // Reverse order: viewport → bounds → overlay
      await fireViewportMoved();
      expect(result.current.ready).toBe(false);

      await fireMediaBoundsChanged();
      expect(result.current.ready).toBe(false);

      await fireOverlayAdded(OVERLAY_A);
      expect(result.current.ready).toBe(true);
    });

    test("is not ready when initialOverlayIds is null", async () => {
      const { result } = renderHook(() => useViewport(null));

      await fireMediaBoundsChanged();
      await fireViewportMoved();

      expect(result.current.ready).toBe(false);
    });
  });

  describe("viewport initialization", () => {
    test("restores a saved viewport when one is available", async () => {
      const savedViewport = { scale: 2, panX: 10, panY: 20 };
      vi.mocked(useModalViewport).mockReturnValue(savedViewport);

      renderHook(() => useViewport(new Set([OVERLAY_A])));

      // Viewport init triggers once mediaBounds is set — overlay readiness is not a gate here
      await fireMediaBoundsChanged();

      expect(mockSetViewportState).toHaveBeenCalledWith(savedViewport);
    });

    test("fits overlays when crop-to-content is enabled and there is no saved viewport", async () => {
      vi.mocked(useCropToContentSetting).mockReturnValue([true]);

      renderHook(() => useViewport(new Set([OVERLAY_A])));
      await fireMediaBoundsChanged();

      expect(mockSetViewportState).toHaveBeenCalledWith({
        scale: 1,
        panX: 0,
        panY: 0,
      });
    });

    test("does not set viewport state when crop is disabled and there is no saved viewport", async () => {
      renderHook(() => useViewport(new Set([OVERLAY_A])));
      await fireMediaBoundsChanged();

      expect(mockSetViewportState).not.toHaveBeenCalled();
    });
  });
});
