/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";
import { CoordinateSystem2D } from "../core/CoordinateSystem2D";
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
