/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { CommandContextManager } from "@fiftyone/commands";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
// Through the package entry: importing KeypointOverlay's module first trips a
// pre-existing overlay import cycle (PolylineOverlay extends KeypointOverlay).
import { KeypointOverlay, type KeypointLabel } from "../index";
import { MockRenderer2D } from "../renderer/MockRenderer2D";
import { GuidedKeypointHandler } from "./GuidedKeypointHandler";
import type { OverlayEvent } from "./InteractionManager";

const HOLE: [number, number] = [NaN, NaN];

/** A two-node skeleton overlay over an identity 100x100 media region. */
const makeOverlay = (): KeypointOverlay => {
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });

  const overlay = new KeypointOverlay({
    id: "kp-guided",
    field: "keypoints",
    label: { label: "person", points: [HOLE, HOLE] } as KeypointLabel,
    connections: [[0, 1]],
  });
  overlay.setRenderer(new MockRenderer2D());
  overlay.setCoordinateSystem(coordinateSystem);

  return overlay;
};

const click = (shiftKey: boolean): OverlayEvent =>
  ({
    worldPoint: { x: 40, y: 30 },
    event: { shiftKey } as PointerEvent,
  }) as OverlayEvent;

const makeHandler = (withSkip = true) => {
  const overlay = makeOverlay();
  const onPlaced = vi.fn();
  const onSkip = vi.fn();
  const handler = new GuidedKeypointHandler(overlay, {
    getTargetIndex: () => 0,
    onPlaced,
    ...(withSkip ? { onSkip } : {}),
  });

  return { overlay, handler, onPlaced, onSkip };
};

describe("GuidedKeypointHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips the target node on Shift+click, leaving it a hole", () => {
    const { overlay, handler, onPlaced, onSkip } = makeHandler();

    expect(handler.onPointerDown(click(true))).toBe(true);

    expect(onSkip).toHaveBeenCalledWith(0);
    expect(onPlaced).not.toHaveBeenCalled();
    expect(overlay.getRelativePoints()[0][0]).toBeNaN();
  });

  it("places the target node on a plain click", () => {
    const { overlay, handler, onPlaced, onSkip } = makeHandler();

    expect(handler.onPointerDown(click(false))).toBe(true);

    expect(onPlaced).toHaveBeenCalledWith(0);
    expect(onSkip).not.toHaveBeenCalled();
    expect(overlay.getRelativePoints()[0]).toEqual([0.4, 0.3]);
  });

  // Regression (2026-09-23): the handler also pushed its own move command, so
  // with the engine's step every placement took two undos, and undoing the
  // command re-committed through the engine and put the node back.
  it("records no undo step of its own: the engine records the placement", () => {
    const pushUndoable = vi.spyOn(
      CommandContextManager.instance().getActiveContext(),
      "pushUndoable",
    );
    const { handler } = makeHandler();

    handler.onPointerDown(click(false));
    handler.onPointerDown(click(true));

    expect(pushUndoable).not.toHaveBeenCalled();
  });

  it("hides the preview when the pointer leaves the canvas", () => {
    const { overlay, handler } = makeHandler();
    const setPreviewPoint = vi.spyOn(overlay, "setPreviewPoint");

    handler.onMove(click(false));
    handler.onCanvasLeave();

    expect(setPreviewPoint).toHaveBeenLastCalledWith(null);
  });

  it("places on Shift+click when the owner offers no skip", () => {
    const { overlay, handler, onPlaced } = makeHandler(false);

    handler.onPointerDown(click(true));

    expect(onPlaced).toHaveBeenCalledWith(0);
    expect(overlay.getRelativePoints()[0]).toEqual([0.4, 0.3]);
  });
});
