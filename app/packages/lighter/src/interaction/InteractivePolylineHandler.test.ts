/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The handler owns pointer dispatch for a selected polyline, which makes it
 * responsible for releasing state the OVERLAY set before the handover.
 */
import { describe, expect, it, vi } from "vitest";
import { InteractivePolylineHandler } from "./InteractivePolylineHandler";
import type { OverlayEvent } from "./InteractionManager";

/**
 * The slice of `PolylineOverlay` this handler touches on a pointer-up. Stubbed
 * rather than constructed: a real overlay needs a renderer, an event bus and a
 * scene, none of which this behaviour depends on.
 */
const makeOverlay = () => ({
  id: "overlay-1",
  cancelPointDrag: vi.fn(),
  getDeletable: vi.fn(() => false),
  setDeletable: vi.fn(),
  getPointById: vi.fn(() => undefined),
  emitPointMoved: vi.fn(),
  setPreviewPoint: vi.fn(),
  setPreviewAnchorSegmentIdx: vi.fn(),
  setPreviewAnchorFlipped: vi.fn(),
  setPreviewAnchorPointId: vi.fn(),
});

const pointerEvent = () =>
  ({
    point: { x: 0, y: 0 },
    worldPoint: { x: 0, y: 0 },
    scale: 1,
  }) as unknown as OverlayEvent;

describe("InteractivePolylineHandler pointer-up", () => {
  it("releases the overlay's point-drag state even with no drag in progress", () => {
    // Regression. Clicking a polyline to select it runs the OVERLAY's own
    // `onPointerDown`, which sets its per-point drag state; selecting also
    // installs this handler, so the matching pointer-up arrives here and the
    // overlay's state was never released. `isInteracting()` is that state, and
    // the engine bridge defers projections onto an interacting handle — so a
    // selected polyline stopped following the playhead (it painted whatever
    // geometry it last held) until the overlay unmounted. `cleanup()` cleared it,
    // but cleanup only runs on teardown, long after the gesture ended.
    const overlay = makeOverlay();
    const handler = new InteractivePolylineHandler(
      overlay as unknown as ConstructorParameters<
        typeof InteractivePolylineHandler
      >[0],
    );

    handler.onPointerUp(pointerEvent());

    expect(overlay.cancelPointDrag).toHaveBeenCalledTimes(1);
  });

  it("still releases it on the pointer-up that ends a real drag", () => {
    const overlay = makeOverlay();
    const handler = new InteractivePolylineHandler(
      overlay as unknown as ConstructorParameters<
        typeof InteractivePolylineHandler
      >[0],
    );

    // a drag in progress: the point resolves, so the committed-move path runs
    overlay.getPointById.mockReturnValue({
      id: "p1",
      position: [0.5, 0.5],
    } as never);
    (handler as unknown as { dragPointId: string | null }).dragPointId = "p1";
    (
      handler as unknown as { dragStartRelative: [number, number] | null }
    ).dragStartRelative = [0.1, 0.1];

    handler.onPointerUp(pointerEvent());

    expect(overlay.cancelPointDrag).toHaveBeenCalledTimes(1);
    expect(overlay.emitPointMoved).toHaveBeenCalledWith(
      "p1",
      [0.1, 0.1],
      [0.5, 0.5],
    );
  });
});
