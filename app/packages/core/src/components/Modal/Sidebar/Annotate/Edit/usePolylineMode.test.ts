/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests for polyline mode's activate / deactivate contract. The behaviour that
 * matters here is that leaving the mode also closes any open polyline edit —
 * right-click off a track's extent reaches the mode quit and nothing else, so a
 * deactivate that only flips the flag strands the sidebar form.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  exit: vi.fn(),
  exitInteractiveMode: vi.fn(),
  enterInteractiveMode: vi.fn(),
  // whether the selected track's overlay is currently mounted on the scene
  hasOverlayRef: { current: true },
  fieldsRef: { current: [{ path: "frames.polylines" }] },
  isPatchesViewRef: { current: false },
  selectedRef: { current: null as unknown },
  lighterHandlers: new Map<string, () => void>(),
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({
    scene: {
      exitInteractiveMode: hoisted.exitInteractiveMode,
      enterInteractiveMode: hoisted.enterInteractiveMode,
      hasOverlay: () => hoisted.hasOverlayRef.current,
      getOverlay: () =>
        hoisted.hasOverlayRef.current
          ? (hoisted.selectedRef.current as { overlay?: unknown } | null)
              ?.overlay
          : undefined,
      getEventChannel: () => "channel",
      getInteractionManager: () => ({ getPixelCoordinates: () => null }),
    },
  }),
  useLighterEventHandler: () => (event: string, cb: () => void) => {
    hoisted.lighterHandlers.set(event, cb);
  },
  useLighterEventBus: () => ({ dispatch: vi.fn() }),
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
  PolylineOverlay: class PolylineOverlay {},
  InteractiveCreationHandler: class InteractiveCreationHandler {},
  InteractivePolylineHandler: class InteractivePolylineHandler {},
  KeypointPointHitAction: { DELETE: "delete" },
  PolylineEmptyHitAction: { NEW_SEGMENT: "new-segment" },
}));

vi.mock("@fiftyone/state", () => ({ isPatchesView: { key: "isPatchesView" } }));

vi.mock("recoil", () => ({
  useRecoilValue: () => hoisted.isPatchesViewRef.current,
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => ({
    selected: hoisted.selectedRef.current,
    clear: vi.fn(),
    createNew: vi.fn(),
  }),
  useAnnotationFields: () => ({ fields: hoisted.fieldsRef.current }),
}));

vi.mock("./useExit", () => ({ default: () => hoisted.exit }));

import {
  InteractiveCreationHandler,
  InteractivePolylineHandler,
  PolylineOverlay,
} from "@fiftyone/lighter";
import { POLYLINE } from "@fiftyone/utilities";
import { usePolylineMode, usePolylineModeInstaller } from "./usePolylineMode";

describe("usePolylineMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.fieldsRef.current = [{ path: "frames.polylines" }];
    hoisted.isPatchesViewRef.current = false;
    hoisted.selectedRef.current = null;
    hoisted.hasOverlayRef.current = true;
  });

  it("closes the open polyline edit when the mode is deactivated", () => {
    // Regression: right-click on a frame outside the selected track's extent
    // has no canvas selection to clear, so it lands on the mode quit — and a
    // deactivate that only flipped the flag left "Edit Polyline" open forever,
    // with right-click (the gesture the canvas hint advertises) doing nothing.
    // Mirrors `useDetectionMode.deactivateDetectionMode`.
    const { result } = renderHook(() => usePolylineMode());

    act(() => result.current.activatePolylineMode());
    expect(result.current.polylineModeActive).toBe(true);

    act(() => result.current.deactivatePolylineMode());

    expect(hoisted.exit).toHaveBeenCalledTimes(1);
    expect(hoisted.exitInteractiveMode).toHaveBeenCalledTimes(1);
    expect(result.current.polylineModeActive).toBe(false);
  });

  it("closes the edit when toggled off, but not when toggled on", () => {
    const { result } = renderHook(() => usePolylineMode());

    act(() => result.current.togglePolylineMode()); // on
    expect(result.current.polylineModeActive).toBe(true);
    expect(hoisted.exit).not.toHaveBeenCalled();

    act(() => result.current.togglePolylineMode()); // off
    expect(result.current.polylineModeActive).toBe(false);
    // turning the tool off from the toolbar is the same exit as right-click
    expect(hoisted.exit).toHaveBeenCalledTimes(1);
  });

  it("does not touch the open edit on activate", () => {
    const { result } = renderHook(() => usePolylineMode());

    act(() => result.current.activatePolylineMode());

    expect(hoisted.exit).not.toHaveBeenCalled();
    expect(hoisted.exitInteractiveMode).not.toHaveBeenCalled();
  });

  it("is disabled with no active polyline fields", () => {
    hoisted.fieldsRef.current = [];
    const { result } = renderHook(() => usePolylineMode());

    expect(result.current.disabled).toBe(true);
    expect(result.current.tooltip).toBe("No active fields");
  });

  it("is disabled in a patches view", () => {
    hoisted.isPatchesViewRef.current = true;
    const { result } = renderHook(() => usePolylineMode());

    expect(result.current.disabled).toBe(true);
  });
});

describe("usePolylineModeInstaller — which handler is installed", () => {
  /** A polyline selection whose overlay may or may not be on the scene. */
  const selectPolyline = () => {
    const overlay = new PolylineOverlay();
    (overlay as unknown as { id: string }).id = "overlay-1";
    hoisted.selectedRef.current = {
      type: POLYLINE,
      overlay,
      label: { overlay, data: { _id: "overlay-1" } },
    };
  };

  const installed = () => hoisted.enterInteractiveMode.mock.calls.at(-1)?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.fieldsRef.current = [{ path: "frames.polylines" }];
    hoisted.isPatchesViewRef.current = false;
    hoisted.selectedRef.current = null;
    hoisted.hasOverlayRef.current = true;
  });

  it("edits the selected polyline while its overlay is on the scene", () => {
    selectPolyline();
    renderHook(() => usePolylineModeInstaller());

    expect(installed()).toBeInstanceOf(InteractivePolylineHandler);
  });

  it("draws a NEW polyline when the selection's overlay is off-extent", () => {
    // Regression: a selected track's overlay unmounts on frames outside its
    // extent while the engine keeps the label active (so scrubbing back re-opens
    // the same edit), and `selected.label.overlay` still references the unmounted
    // overlay. Installing the edit handler there meant no creation handler was
    // installed, so clicking the canvas did nothing at all — where a detection
    // would have started a new instance.
    selectPolyline();
    hoisted.hasOverlayRef.current = false;
    renderHook(() => usePolylineModeInstaller());

    expect(installed()).toBeInstanceOf(InteractiveCreationHandler);
  });

  it("re-evaluates when an overlay mounts or unmounts", () => {
    // Crossing a track's extent changes which handler belongs installed without
    // `selected` ever changing, so the install effect has to be driven by the
    // scene's overlay events too.
    selectPolyline();
    renderHook(() => usePolylineModeInstaller());
    expect(installed()).toBeInstanceOf(InteractivePolylineHandler);

    hoisted.hasOverlayRef.current = false;
    act(() => hoisted.lighterHandlers.get("lighter:overlay-removed")?.());
    expect(installed()).toBeInstanceOf(InteractiveCreationHandler);

    hoisted.hasOverlayRef.current = true;
    act(() => hoisted.lighterHandlers.get("lighter:overlay-added")?.());
    expect(installed()).toBeInstanceOf(InteractivePolylineHandler);
  });
});
