/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// The SUT is a registration hook: it calls `useLighterEventHandler(channel)`
// to get a `useEventHandler(name, callback)` that wires callbacks to events.
// Our mock for `useLighterEventHandler` captures every registered handler
// keyed by event name so the test can invoke them directly with payloads.

const hoisted = vi.hoisted(() => {
  type Handler = (payload: Record<string, unknown>) => void;
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    isPointSelectionActiveRef: { value: true },
    toolsStateSpies: {
      addPositivePoint: vi.fn(),
      addNegativePoint: vi.fn(),
      removePositivePoint: vi.fn(),
      removeNegativePoint: vi.fn(),
      updatePoint: vi.fn(),
    },
    rippleSpies: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
});

vi.mock("@fiftyone/lighter", () => ({
  RIPPLE_VISIBLE_MS: 1234,
  UNDEFINED_LIGHTER_SCENE_ID: "UNDEFINED_LIGHTER_SCENE_ID",
  useLighter: () => ({
    scene: { getEventChannel: () => "test-channel" },
    getOverlay: vi.fn(),
  }),
  useLighterEventHandler: () => (event: string, handler: unknown) => {
    hoisted.handlers.set(event, handler as never);
  },
}));

vi.mock("./useToolsContext", () => ({
  useToolsState: () => hoisted.toolsStateSpies,
}));

vi.mock("./usePointSelection", async () => {
  const orig = (await vi.importActual<object>("./resolvePointVariant")) as Record<
    string,
    unknown
  >;
  return {
    // Mirror the constants so the SUT can compare to NEGATIVE_POINT_VARIANT
    NEGATIVE_POINT_VARIANT: orig.NEGATIVE_POINT_VARIANT,
    POSITIVE_POINT_VARIANT: orig.POSITIVE_POINT_VARIANT,
    usePointSelection: () => ({
      isActive: hoisted.isPointSelectionActiveRef.value,
      activate: vi.fn(),
      deactivate: vi.fn(),
      clearPoints: vi.fn(),
    }),
    useSyncPointSelectionWithScene: vi.fn(),
  };
});

vi.mock("./useKeypointRippleEffect", () => ({
  useKeypointRippleEffect: () => hoisted.rippleSpies,
}));

import { useRegisterPointSelectionEventHandlers } from "./useRegisterPointSelectionEventHandlers";

// ── Helpers ──────────────────────────────────────────────────────────────────

const setupRegistered = () => {
  renderHook(() => useRegisterPointSelectionEventHandlers());
};

const fire = (event: string, payload: Record<string, unknown>) => {
  const handler = hoisted.handlers.get(event);
  if (!handler) throw new Error(`No handler registered for ${event}`);
  handler(payload);
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useRegisterPointSelectionEventHandlers", () => {
  beforeEach(() => {
    hoisted.handlers.clear();
    hoisted.isPointSelectionActiveRef.value = true;
    vi.clearAllMocks();
  });

  it("registers handlers for keypoint-added/deleted/moved", () => {
    setupRegistered();
    expect(hoisted.handlers.has("lighter:keypoint-point-added")).toBe(true);
    expect(hoisted.handlers.has("lighter:keypoint-point-deleted")).toBe(true);
    expect(hoisted.handlers.has("lighter:keypoint-point-moved")).toBe(true);
  });

  describe("keypoint-point-added", () => {
    it("negative variant → addNegativePoint with the descriptor and adds a ripple", () => {
      setupRegistered();
      fire("lighter:keypoint-point-added", {
        id: "overlay-1",
        pointId: "kp-1",
        point: { x: 0.3, y: 0.4 },
        variant: "negative",
      });

      expect(hoisted.toolsStateSpies.addNegativePoint).toHaveBeenCalledWith({
        id: "kp-1",
        point: [0.3, 0.4],
      });
      expect(hoisted.toolsStateSpies.addPositivePoint).not.toHaveBeenCalled();
      expect(hoisted.rippleSpies.add).toHaveBeenCalledWith(
        "overlay-1",
        "kp-1",
        1234
      );
    });

    it("non-negative variant → addPositivePoint and adds a ripple", () => {
      setupRegistered();
      fire("lighter:keypoint-point-added", {
        id: "overlay-1",
        pointId: "kp-2",
        point: { x: 0.5, y: 0.6 },
        variant: "positive",
      });

      expect(hoisted.toolsStateSpies.addPositivePoint).toHaveBeenCalledWith({
        id: "kp-2",
        point: [0.5, 0.6],
      });
      expect(hoisted.toolsStateSpies.addNegativePoint).not.toHaveBeenCalled();
      expect(hoisted.rippleSpies.add).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when point selection is inactive", () => {
      hoisted.isPointSelectionActiveRef.value = false;
      setupRegistered();

      fire("lighter:keypoint-point-added", {
        id: "overlay-1",
        pointId: "kp-x",
        point: { x: 0, y: 0 },
        variant: "positive",
      });

      expect(hoisted.toolsStateSpies.addPositivePoint).not.toHaveBeenCalled();
      expect(hoisted.toolsStateSpies.addNegativePoint).not.toHaveBeenCalled();
      expect(hoisted.rippleSpies.add).not.toHaveBeenCalled();
    });
  });

  describe("keypoint-point-deleted", () => {
    it("always cleans up the ripple, even if point selection is inactive", () => {
      hoisted.isPointSelectionActiveRef.value = false;
      setupRegistered();

      fire("lighter:keypoint-point-deleted", {
        id: "overlay-1",
        pointId: "kp-1",
        variant: "negative",
      });

      // ripple removal isn't gated on isPointSelectionActive — indefinite
      // ripples would otherwise leak the rAF loop.
      expect(hoisted.rippleSpies.remove).toHaveBeenCalledWith(
        "overlay-1",
        "kp-1"
      );
      // toolsState mutations ARE gated on active.
      expect(hoisted.toolsStateSpies.removeNegativePoint).not.toHaveBeenCalled();
      expect(hoisted.toolsStateSpies.removePositivePoint).not.toHaveBeenCalled();
    });

    it("negative variant → removeNegativePoint when active", () => {
      setupRegistered();
      fire("lighter:keypoint-point-deleted", {
        id: "overlay-1",
        pointId: "kp-neg",
        variant: "negative",
      });

      expect(hoisted.toolsStateSpies.removeNegativePoint).toHaveBeenCalledWith(
        "kp-neg"
      );
      expect(hoisted.toolsStateSpies.removePositivePoint).not.toHaveBeenCalled();
      expect(hoisted.rippleSpies.remove).toHaveBeenCalledTimes(1);
    });

    it("non-negative variant → removePositivePoint when active", () => {
      setupRegistered();
      fire("lighter:keypoint-point-deleted", {
        id: "overlay-1",
        pointId: "kp-pos",
        variant: "positive",
      });

      expect(hoisted.toolsStateSpies.removePositivePoint).toHaveBeenCalledWith(
        "kp-pos"
      );
      expect(hoisted.toolsStateSpies.removeNegativePoint).not.toHaveBeenCalled();
    });
  });

  describe("keypoint-point-moved", () => {
    it("forwards the new point as a descriptor when active", () => {
      setupRegistered();
      fire("lighter:keypoint-point-moved", {
        id: "overlay-1",
        pointId: "kp-1",
        to: { x: 0.7, y: 0.8 },
      });

      expect(hoisted.toolsStateSpies.updatePoint).toHaveBeenCalledWith({
        id: "kp-1",
        point: [0.7, 0.8],
      });
    });

    it("is a no-op when inactive", () => {
      hoisted.isPointSelectionActiveRef.value = false;
      setupRegistered();
      fire("lighter:keypoint-point-moved", {
        id: "overlay-1",
        pointId: "kp-1",
        to: { x: 0.7, y: 0.8 },
      });

      expect(hoisted.toolsStateSpies.updatePoint).not.toHaveBeenCalled();
    });
  });
});
