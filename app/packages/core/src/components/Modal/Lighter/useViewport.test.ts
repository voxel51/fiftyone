// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import useViewport from "./useViewport";

// Hoisted so vi.mock factories can reference these before module-level code runs
const {
  mockBus,
  mockSetViewportState,
  mockFitToContent,
  mockGetContentBounds,
  mockEventBusDispatch,
  mockGetModalViewport,
  mockUseModalLookerOptions,
} = vi.hoisted(() => {
  const map = new Map<string, Set<(...args: any[]) => any>>();

  const on = (event: string, handler: (...args: any[]) => any) => {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event)!.add(handler);
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
    mockFitToContent: vi.fn(),
    mockGetContentBounds: vi.fn<() => any>(() => null),
    mockEventBusDispatch: vi.fn(),
    mockGetModalViewport: vi.fn<() => any>(() => null),
    mockUseModalLookerOptions: vi.fn<() => any>(() => ({})),
  };
});

vi.mock("@fiftyone/lighter", async () => {
  const { useEffect } = await import("react");
  return {
    useLighter: () => ({
      scene: {
        getEventChannel: () => "test-channel",
        setViewportState: mockSetViewportState,
        fitToContent: mockFitToContent,
        getContentBounds: mockGetContentBounds,
      },
    }),
    useLighterEventHandler:
      (_channelId: string) =>
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
    useLighterEventBus: (_channelId: string) => ({
      dispatch: mockEventBusDispatch,
    }),
    UNDEFINED_LIGHTER_SCENE_ID: "UNDEFINED_LIGHTER_SCENE",
    DEFAULT_ZOOM_PAD: 0.1,
  };
});

vi.mock("@fiftyone/state", () => ({
  useModalLookerOptions: mockUseModalLookerOptions,
  modalBridge: {
    getModalViewport: () => mockGetModalViewport(),
  },
}));

// --- Event helpers ---

const BOUNDS = { x: 0, y: 0, width: 100, height: 100 };
const CONTENT_BOUNDS = { x: 0, y: 0, width: 50, height: 50 };

const fireMediaBoundsChanged = (bounds = BOUNDS) =>
  act(() =>
    mockBus.dispatch("lighter:canonical-media-bounds-changed", { bounds })
  );

const fireRendererReady = () =>
  act(() => mockBus.dispatch("lighter:renderer-ready", undefined));

const fireOverlayAdded = () =>
  act(() => mockBus.dispatch("lighter:overlay-added", undefined));

// --- Tests ---

describe("useViewport", () => {
  beforeEach(() => {
    mockBus.clearAll();
    mockSetViewportState.mockClear();
    mockFitToContent.mockClear();
    mockEventBusDispatch.mockClear();
    mockGetModalViewport.mockReturnValue(null);
    mockGetContentBounds.mockReturnValue(null);
    mockUseModalLookerOptions.mockReturnValue({});
  });

  describe("viewport initialization", () => {
    test("restores a saved viewport when sampleId matches", async () => {
      const savedViewport = {
        sampleId: "sample-1",
        scale: 2,
        panX: 10,
        panY: 20,
      };
      mockGetModalViewport.mockReturnValue(savedViewport);

      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();

      expect(mockSetViewportState).toHaveBeenCalledWith(savedViewport);
    });

    test("does not restore viewport when sampleId does not match the saved viewport", async () => {
      const savedViewport = {
        sampleId: "other-sample",
        scale: 2,
        panX: 10,
        panY: 20,
      };
      mockGetModalViewport.mockReturnValue(savedViewport);

      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();

      expect(mockSetViewportState).not.toHaveBeenCalled();
    });

    test("fits to content when zoom is enabled and spatial content is immediately available", async () => {
      mockUseModalLookerOptions.mockReturnValue({ zoom: true });
      mockGetContentBounds.mockReturnValue(CONTENT_BOUNDS);

      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();

      expect(mockFitToContent).toHaveBeenCalledWith(0.1);
      expect(mockSetViewportState).not.toHaveBeenCalled();
    });

    test("waits for a spatial overlay before fitting when zoom is enabled", async () => {
      mockUseModalLookerOptions.mockReturnValue({ zoom: true });
      // getContentBounds returns null initially — no spatial content yet

      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();
      expect(mockFitToContent).not.toHaveBeenCalled();

      // Spatial overlay arrives
      mockGetContentBounds.mockReturnValue(CONTENT_BOUNDS);
      await fireOverlayAdded();
      expect(mockFitToContent).toHaveBeenCalledWith(0.1);
    });

    test("dispatches init-complete without any viewport action when zoom is disabled and there is no saved viewport", async () => {
      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();

      expect(mockSetViewportState).not.toHaveBeenCalled();
      expect(mockFitToContent).not.toHaveBeenCalled();
      expect(mockEventBusDispatch).toHaveBeenCalledWith(
        "lighter:viewport-init-complete",
        {}
      );
    });

    test("does not initialize before the renderer is ready", async () => {
      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      // fireRendererReady intentionally omitted

      expect(mockSetViewportState).not.toHaveBeenCalled();
      expect(mockFitToContent).not.toHaveBeenCalled();
      expect(mockEventBusDispatch).not.toHaveBeenCalled();
    });

    test("does not initialize before media bounds are known", async () => {
      renderHook(() => useViewport("sample-1"));

      await fireRendererReady();
      // fireMediaBoundsChanged intentionally omitted

      expect(mockSetViewportState).not.toHaveBeenCalled();
      expect(mockFitToContent).not.toHaveBeenCalled();
      expect(mockEventBusDispatch).not.toHaveBeenCalled();
    });

    test("initializes only once even when preconditions fire multiple times", async () => {
      const savedViewport = {
        sampleId: "sample-1",
        scale: 2,
        panX: 10,
        panY: 20,
      };
      mockGetModalViewport.mockReturnValue(savedViewport);

      renderHook(() => useViewport("sample-1"));

      await fireMediaBoundsChanged();
      await fireRendererReady();
      // Dispatch init-complete conditions again — should not re-initialize
      await fireMediaBoundsChanged();
      await fireRendererReady();

      expect(mockSetViewportState).toHaveBeenCalledTimes(1);
    });
  });
});
