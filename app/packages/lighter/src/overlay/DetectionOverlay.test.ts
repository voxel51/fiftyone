/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
import { CONTAINS } from "../core/Scene2D";
import { MockRenderer2D } from "../renderer/MockRenderer2D";
import { DetectionOverlay } from "./DetectionOverlay";
import type { MaskCanvas } from "./MaskCanvas";

// encodeMask resolves async; stub it so constructing/painting masks doesn't hit
// real worker encoding in jsdom.
vi.mock("../utils", async () => {
  const actual = await vi.importActual<typeof import("../utils")>("../utils");
  return { ...actual, encodeMask: vi.fn().mockResolvedValue("encoded-mask") };
});

const makeOverlay = (): DetectionOverlay => {
  const overlay = new DetectionOverlay({
    id: "track-1",
    field: "frames.detections",
    label: {
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.2, 0.2],
      // inline mask → constructs a MaskCanvas, so hasMask() is true
      mask: "seed-mask",
    },
  });

  // applyLabel reads `bounds` (via the bounds-changed dispatch), which needs a
  // coordinate system.
  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });
  overlay.setCoordinateSystem(coordinateSystem);

  return overlay;
};

/** The overlay's private MaskCanvas (test seam — spy on its encode state). */
const maskOf = (overlay: DetectionOverlay): MaskCanvas =>
  (overlay as unknown as { mask: MaskCanvas }).mask;

describe("DetectionOverlay.applyLabel mask drop", () => {
  it("keeps a freshly-painted mask while its async encode is still in flight", () => {
    const overlay = makeOverlay();
    expect(overlay.hasMask()).toBe(true);

    // simulate a paint whose encode hasn't resolved yet
    vi.spyOn(maskOf(overlay), "hasPendingEncode").mockReturnValue(true);

    // a reproject carrying the still-committed, mask-less value (the video
    // auto-extend / keyframe-promotion write that lands before the encode)
    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.2, 0.2],
    });

    // the in-flight paint must survive — destroying it would abort the encode
    expect(overlay.hasMask()).toBe(true);
  });

  it("drops a mask on a mask-less reproject once no encode is in flight", () => {
    const overlay = makeOverlay();
    vi.spyOn(maskOf(overlay), "hasPendingEncode").mockReturnValue(false);

    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.2, 0.2],
    });

    // normal video filler-frame behavior: mask clears past the keyframe
    expect(overlay.hasMask()).toBe(false);
  });
});

describe("DetectionOverlay.applyLabel gesture guard", () => {
  // Regression: an autosave-tick reconcile reprojects the OLD committed box
  // while the user is still painting/resizing. Painting outside the box grows
  // the live bounds, so the reproject's (narrower) box must not overwrite them —
  // onPointerUp's paintEnd(this.bounds) would otherwise bake the mask against
  // the stale bounds and squash it.
  const setInteracting = (overlay: DetectionOverlay, state: string): void => {
    (overlay as unknown as { interactionState: string }).interactionState =
      state;
  };

  it("does not clobber live bounds while a gesture is in flight", () => {
    const overlay = makeOverlay();
    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.4, 0.4],
    });
    const liveBounds = { ...overlay.relativeBounds };

    setInteracting(overlay, "PAINTING");
    // the tick reprojects the old, narrow committed box
    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.5, 0.1, 0.02, 0.4],
    });

    expect(overlay.relativeBounds).toEqual(liveBounds);
  });

  it("does not drop the mask on a mask-less reproject during a gesture", () => {
    const overlay = makeOverlay();
    vi.spyOn(maskOf(overlay), "hasPendingEncode").mockReturnValue(false);

    setInteracting(overlay, "PAINTING");
    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.2, 0.2],
    });

    expect(overlay.hasMask()).toBe(true);
  });
});

/**
 * Rotation tests. World frame: the 100x100 coordinate system maps the
 * relative box [0.1, 0.1, 0.2, 0.2] to x/y 10..30 (center (20, 20)).
 * At scale 1 the rotate handle sits 24px above the top edge: (20, -14).
 */
const makeRotatableOverlay = (
  boundingBox: [number, number, number, number] = [0.1, 0.1, 0.2, 0.2],
): DetectionOverlay => {
  const overlay = new DetectionOverlay({
    id: "box-1",
    field: "ground_truth",
    label: { label: "vehicle", bounding_box: boundingBox },
    relativeBounds: {
      x: boundingBox[0],
      y: boundingBox[1],
      width: boundingBox[2],
      height: boundingBox[3],
    },
  });

  const coordinateSystem = new CoordinateSystem2D();
  coordinateSystem.updateTransform({ x: 0, y: 0, width: 100, height: 100 });
  overlay.setCoordinateSystem(coordinateSystem);
  overlay.setRenderer(new MockRenderer2D());
  overlay.setSelected(true);

  return overlay;
};

const pointerEvent = (init: Partial<PointerEvent> = {}): PointerEvent =>
  ({ buttons: 1, shiftKey: false, ...init }) as PointerEvent;

const at = (x: number, y: number, event = pointerEvent()) => ({
  point: { x, y },
  worldPoint: { x, y },
  event,
  scale: 1,
});

describe("DetectionOverlay rotation gesture", () => {
  it("enters ROTATING on pointer-down over the rotate handle", () => {
    const overlay = makeRotatableOverlay();

    expect(overlay.onPointerDown(at(20, -14))).toBe(true);
    expect(overlay.isRotating()).toBe(true);
    expect(overlay.getMoveStartRotation()).toBe(0);
  });

  it("rotates with the pointer around the box center", () => {
    const overlay = makeRotatableOverlay();
    overlay.onPointerDown(at(20, -14));

    // handle grabbed at -90deg from center; dragging to 0deg (due right of
    // center) is a quarter turn clockwise
    overlay.onMove(at(54, 20));

    expect(overlay.getRotation()).toBeCloseTo(Math.PI / 2);
  });

  it("snaps to 15-degree increments while shift is held", () => {
    const overlay = makeRotatableOverlay();
    overlay.onPointerDown(at(20, -14));

    // pointer at 0.3rad past the grab angle; PI/12 (15deg) is the nearest snap
    const angle = -Math.PI / 2 + 0.3;
    overlay.onMove(
      at(
        20 + 34 * Math.cos(angle),
        20 + 34 * Math.sin(angle),
        pointerEvent({ shiftKey: true }),
      ),
    );

    expect(overlay.getRotation()).toBeCloseTo(Math.PI / 12);
  });

  it("resets gesture state on pointer-up", () => {
    const overlay = makeRotatableOverlay();
    overlay.onPointerDown(at(20, -14));
    overlay.onMove(at(54, 20));
    overlay.onPointerUp(at(54, 20));

    expect(overlay.isRotating()).toBe(false);
    expect(overlay.getMoveStartRotation()).toBeUndefined();
    // the rotation itself survives the gesture
    expect(overlay.getRotation()).toBeCloseTo(Math.PI / 2);
  });

  it("reports 0 rotation for masked detections", () => {
    const overlay = makeOverlay(); // mask-bearing helper above
    overlay.applyLabel({
      label: "vehicle",
      bounding_box: [0.1, 0.1, 0.2, 0.2],
      mask: "seed-mask",
      rotation: 1,
    });

    expect(overlay.getRotation()).toBe(0);
  });
});

describe("DetectionOverlay rotated hit-testing", () => {
  it("contains points that only fall inside under rotation", () => {
    // wide flat box: world x 10..50, y 10..20, center (30, 15)
    const overlay = makeRotatableOverlay([0.1, 0.1, 0.4, 0.1]);
    overlay.setRotation(Math.PI / 2);

    // (30, 32) is far below the unrotated box but inside the rotated one
    // (the 40px width points vertically after a quarter turn)
    expect(overlay.getContainmentLevel({ x: 30, y: 32 })).toBe(
      CONTAINS.CONTENT,
    );
    overlay.setRotation(0);
    expect(overlay.getContainmentLevel({ x: 30, y: 32 })).toBe(CONTAINS.NONE);
  });
});

describe("DetectionOverlay rotated resize", () => {
  // Regression: at 180deg the visual top edge is the box's local SOUTH edge.
  // Resizing used to apply the raw screen delta to the stored rect, so
  // dragging the top moved the bottom (and vice versa).
  it("resizes the grabbed edge, not the opposite one, at 180deg", () => {
    const overlay = makeRotatableOverlay();
    overlay.setRotation(Math.PI);

    // grab the VISUAL top edge (local south at 180deg)...
    overlay.onPointerDown(at(20, 10.5));
    expect(overlay.isResizing()).toBe(true);

    // ...and drag it up by 5px
    overlay.onMove(at(20, 5.5));

    const { x, y, width, height } = overlay.bounds;
    expect(x).toBeCloseTo(10);
    expect(width).toBeCloseTo(20);
    // the grabbed (top) edge followed the cursor
    expect(y).toBeCloseTo(5);
    expect(height).toBeCloseTo(25);
    // the opposite (bottom) edge stayed fixed
    expect(y + height).toBeCloseTo(30);
  });

  it("keeps the opposite edge fixed at 90deg", () => {
    // wide flat box: world x 10..50, y 10..20, center (30, 15); rotated a
    // quarter turn it VISUALLY spans x 25..35, y -5..35
    const overlay = makeRotatableOverlay([0.1, 0.1, 0.4, 0.1]);
    overlay.setRotation(Math.PI / 2);

    // the visual right edge (x = 35) is the box's local NORTH edge
    overlay.onPointerDown(at(34.5, 15));
    expect(overlay.isResizing()).toBe(true);

    // drag right by 4px
    overlay.onMove(at(38.5, 15));

    const { x, y, width, height } = overlay.bounds;
    // stored rect: height grew by 4 along the local axis, center shifted so
    // the visual left edge stays at 25 and the right lands at 39
    expect(width).toBeCloseTo(40);
    expect(height).toBeCloseTo(14);
    // verify visually: rotated extent spans x 25..39, center y unmoved
    const cx = x + width / 2;
    expect(cx - height / 2).toBeCloseTo(25);
    expect(cx + height / 2).toBeCloseTo(39);
    expect(y + height / 2).toBeCloseTo(15);
  });
});
