/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture the callbacks the hook registers so tests can fire them directly.
// `useLighterEventHandler(channel)` returns a per-channel registrar; we store
// the latest callback per event name. `TemporalOverlay` must be a real class
// for the hook's `instanceof` guard.
const { lighterHandlers, annotationHandlers } = vi.hoisted(() => ({
  lighterHandlers: new Map<string, (payload: unknown) => void>(),
  annotationHandlers: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("@fiftyone/lighter", () => {
  class TemporalOverlay {}
  return {
    TemporalOverlay,
    UNDEFINED_LIGHTER_SCENE_ID: "__undefined__",
    useLighterEventHandler:
      () => (event: string, cb: (payload: unknown) => void) => {
        lighterHandlers.set(event, cb);
      },
  };
});

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEventHandler: (
    event: string,
    cb: (payload: unknown) => void
  ) => {
    annotationHandlers.set(event, cb);
  },
}));

import { TemporalOverlay } from "@fiftyone/lighter";
import { useTemporalOverlayVersion } from "./useTemporalOverlayVersion";

const fireLighter = (event: string, payload: unknown) =>
  act(() => lighterHandlers.get(event)!(payload));
const fireAnnotation = (event: string, payload: unknown) =>
  act(() => annotationHandlers.get(event)!(payload));

// A stable scene reference per test — the hook keys the `bumpOnSceneReady`
// effect on `scene` identity, so a fresh object per render would loop.
const makeScene = () => ({ getEventChannel: () => "channel-1" } as never);
let scene: ReturnType<typeof makeScene>;

beforeEach(() => {
  lighterHandlers.clear();
  annotationHandlers.clear();
  scene = makeScene();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTemporalOverlayVersion", () => {
  it("starts at 0", () => {
    const { result } = renderHook(() => useTemporalOverlayVersion(scene));
    expect(result.current).toBe(0);
  });

  describe("overlay-added", () => {
    it("bumps when a TemporalOverlay is added to the scene", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      fireLighter("lighter:overlay-added", {
        overlay: new TemporalOverlay({} as never),
      });

      expect(result.current).toBe(1);
    });

    it("ignores non-temporal overlays", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      fireLighter("lighter:overlay-added", { overlay: { id: "det-1" } });

      expect(result.current).toBe(0);
    });
  });

  describe("overlay-removed", () => {
    it("bumps on any overlay removal (the removed id no longer reveals the type)", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      fireLighter("lighter:overlay-removed", { id: "any-overlay" });

      expect(result.current).toBe(1);
    });

    it("bumps even when the removal payload has no id", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      fireLighter("lighter:overlay-removed", { id: undefined });

      expect(result.current).toBe(1);
    });
  });

  describe("annotation:labelEdit (listenLabelEdit)", () => {
    it("does not bump on a TD label edit when the flag is off (default)", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      fireAnnotation("annotation:labelEdit", {
        label: { _cls: "TemporalDetection" },
      });

      expect(result.current).toBe(0);
    });

    it("bumps on a TD label edit when the flag is on", () => {
      const { result } = renderHook(() =>
        useTemporalOverlayVersion(scene, { listenLabelEdit: true })
      );

      fireAnnotation("annotation:labelEdit", {
        label: { _cls: "TemporalDetection" },
      });

      expect(result.current).toBe(1);
    });

    it("ignores edits to non-TD labels even when the flag is on", () => {
      const { result } = renderHook(() =>
        useTemporalOverlayVersion(scene, { listenLabelEdit: true })
      );

      fireAnnotation("annotation:labelEdit", { label: { _cls: "Detection" } });
      fireAnnotation("annotation:labelEdit", { label: null });

      expect(result.current).toBe(0);
    });
  });

  describe("bumpOnSceneReady", () => {
    it("emits a one-shot bump once the scene is available", () => {
      const { result } = renderHook(() =>
        useTemporalOverlayVersion(scene, { bumpOnSceneReady: true })
      );

      expect(result.current).toBe(1);
    });

    it("does not bump on mount when the scene is null", () => {
      const { result } = renderHook(() =>
        useTemporalOverlayVersion(null, { bumpOnSceneReady: true })
      );

      expect(result.current).toBe(0);
    });

    it("does not bump on mount when the flag is off", () => {
      const { result } = renderHook(() => useTemporalOverlayVersion(scene));

      expect(result.current).toBe(0);
    });
  });
});
