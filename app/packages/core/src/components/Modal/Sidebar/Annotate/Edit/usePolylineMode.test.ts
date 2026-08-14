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
  fieldsRef: { current: [{ path: "frames.polylines" }] },
  isPatchesViewRef: { current: false },
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({
    scene: { exitInteractiveMode: hoisted.exitInteractiveMode },
  }),
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
  useAnnotationContext: () => ({ selected: null, clear: vi.fn() }),
  useAnnotationFields: () => ({ fields: hoisted.fieldsRef.current }),
}));

vi.mock("./useExit", () => ({ default: () => hoisted.exit }));

import { usePolylineMode } from "./usePolylineMode";

describe("usePolylineMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.fieldsRef.current = [{ path: "frames.polylines" }];
    hoisted.isPatchesViewRef.current = false;
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
