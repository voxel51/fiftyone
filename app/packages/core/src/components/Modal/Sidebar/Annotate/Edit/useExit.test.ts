// @vitest-environment jsdom
/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * `useExit` closes the sidebar form and releases whatever the form held. The
 * case that matters here is a DRAFT with drawn content: its overlay was
 * selected in the scene with side effects suppressed and its ref is never
 * engine-active, so the engine route (`setActive([])`) cannot deselect it.
 * Exit has to deselect it in the scene itself, or an exit that isn't a canvas
 * right-click (Back arrow, Select tool, click-outside) strands the draw as the
 * scene's selection.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  clear: vi.fn(),
  removeOverlay: vi.fn(),
  setActive: vi.fn(),
  setActivePrimitive: vi.fn(),
  scene: {
    deselectOverlay: vi.fn(),
    exitInteractiveMode: vi.fn(),
    isDestroyed: false,
    renderLoopActive: true,
  },
  selectedRef: { current: null as unknown },
}));

vi.mock("@fiftyone/annotation", () => ({
  useAnnotationEngine: () => ({
    interaction: { setActive: hoisted.setActive },
  }),
}));

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: class DetectionOverlay {},
  useLighter: () => ({
    removeOverlay: hoisted.removeOverlay,
    scene: hoisted.scene,
  }),
}));

vi.mock("@fiftyone/lighter/src/core/Scene2D", () => ({
  TypeGuards: {
    isHoverable: (overlay: unknown) =>
      typeof (overlay as { onHoverLeave?: unknown })?.onHoverLeave ===
      "function",
  },
}));

vi.mock("./useActivePrimitive", () => ({
  usePrimitiveController: () => ({
    setActivePrimitive: hoisted.setActivePrimitive,
  }),
}));

vi.mock("./useAnnotationContext", () => ({
  useAnnotationContext: () => ({
    clear: hoisted.clear,
    selected: hoisted.selectedRef.current,
  }),
}));

import { POLYLINE } from "@fiftyone/utilities";
import useExit from "./useExit";

const OVERLAY_ID = "polyline-draft";

const makeOverlay = () => ({ id: OVERLAY_ID, onHoverLeave: vi.fn() });

const select = (options: { isNew: boolean; points: number[][][] }) => {
  const overlay = makeOverlay();
  hoisted.selectedRef.current = {
    label: {
      isNew: options.isNew,
      type: POLYLINE,
      path: "polylines",
      overlay,
      data: { _id: OVERLAY_ID, points: options.points },
    },
    overlay,
  };
  return overlay;
};

const DRAWN = [
  [
    [0.1, 0.1],
    [0.2, 0.2],
  ],
];

describe("useExit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.scene.isDestroyed = false;
    hoisted.selectedRef.current = null;
  });

  it("deselects a drawn draft's overlay in the scene, without side effects", () => {
    const overlay = select({ isNew: true, points: DRAWN });
    const { result } = renderHook(() => useExit());

    act(() => result.current());

    expect(hoisted.scene.deselectOverlay).toHaveBeenCalledWith(OVERLAY_ID, {
      ignoreSideEffects: true,
    });
    // a drawn draft is real content: it is released, never removed
    expect(hoisted.removeOverlay).not.toHaveBeenCalled();
    expect(overlay.onHoverLeave).toHaveBeenCalled();
    expect(hoisted.clear).toHaveBeenCalled();
    expect(hoisted.setActivePrimitive).toHaveBeenCalledWith(null);
    expect(hoisted.setActive).toHaveBeenCalledWith([]);
  });

  it("leaves a committed label's selection to the engine route", () => {
    select({ isNew: false, points: DRAWN });
    const { result } = renderHook(() => useExit());

    act(() => result.current());

    expect(hoisted.scene.deselectOverlay).not.toHaveBeenCalled();
    expect(hoisted.removeOverlay).not.toHaveBeenCalled();
    expect(hoisted.setActive).toHaveBeenCalledWith([]);
  });

  it("removes an empty draft instead of deselecting it", () => {
    select({ isNew: true, points: [] });
    const { result } = renderHook(() => useExit());

    act(() => result.current());

    expect(hoisted.scene.exitInteractiveMode).toHaveBeenCalled();
    expect(hoisted.removeOverlay).toHaveBeenCalledWith(OVERLAY_ID, true);
    expect(hoisted.scene.deselectOverlay).not.toHaveBeenCalled();
    expect(hoisted.clear).toHaveBeenCalled();
  });

  it("skips the scene when it has been torn down", () => {
    select({ isNew: true, points: DRAWN });
    hoisted.scene.isDestroyed = true;
    const { result } = renderHook(() => useExit());

    act(() => result.current());

    expect(hoisted.scene.deselectOverlay).not.toHaveBeenCalled();
    expect(hoisted.clear).toHaveBeenCalled();
    expect(hoisted.setActive).toHaveBeenCalledWith([]);
  });
});
