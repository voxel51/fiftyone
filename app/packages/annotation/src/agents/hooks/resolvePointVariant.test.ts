/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// Provide a real `DetectionOverlay` class so `instanceof DetectionOverlay`
// inside the SUT matches instances we construct in the test. Same trick used
// in useLighterDeltaSupplier.test.ts and buildAnnotationLabel.test.ts.

const hoisted = vi.hoisted(() => {
  class MockDetectionOverlay {
    private hit = false;
    setHit(v: boolean) {
      this.hit = v;
    }
    containsMaskPixel(_point: unknown): boolean {
      return this.hit;
    }
  }
  return { MockDetectionOverlay };
});

vi.mock("@fiftyone/lighter", () => ({
  DetectionOverlay: hoisted.MockDetectionOverlay,
}));

vi.mock("@fiftyone/utilities", () => ({}));
vi.mock("@fiftyone/state", () => ({}));

import {
  NEGATIVE_POINT_VARIANT,
  POSITIVE_POINT_VARIANT,
  resolvePointVariant,
} from "./resolvePointVariant";

// ── Helpers ──────────────────────────────────────────────────────────────────

const POINT = { x: 0.5, y: 0.5 };

const labelHittingMask = () => {
  const overlay = new hoisted.MockDetectionOverlay();
  overlay.setHit(true);
  return { overlay } as never;
};

const labelMissingMask = () => {
  const overlay = new hoisted.MockDetectionOverlay();
  overlay.setHit(false);
  return { overlay } as never;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("resolvePointVariant", () => {
  it("off-mask click → POSITIVE", () => {
    expect(
      resolvePointVariant(POINT, { shiftKey: false }, labelMissingMask())
    ).toBe(POSITIVE_POINT_VARIANT);
  });

  it("on-mask click → NEGATIVE", () => {
    expect(
      resolvePointVariant(POINT, { shiftKey: false }, labelHittingMask())
    ).toBe(NEGATIVE_POINT_VARIANT);
  });

  it("shift inverts: off-mask + shift → NEGATIVE", () => {
    expect(
      resolvePointVariant(POINT, { shiftKey: true }, labelMissingMask())
    ).toBe(NEGATIVE_POINT_VARIANT);
  });

  it("shift inverts: on-mask + shift → POSITIVE", () => {
    expect(
      resolvePointVariant(POINT, { shiftKey: true }, labelHittingMask())
    ).toBe(POSITIVE_POINT_VARIANT);
  });

  it("label without a DetectionOverlay → defaults to POSITIVE (nothing to be on-mask of)", () => {
    const labelWithNonDetectionOverlay = { overlay: {} } as never;
    expect(
      resolvePointVariant(POINT, { shiftKey: false }, labelWithNonDetectionOverlay)
    ).toBe(POSITIVE_POINT_VARIANT);
  });

  it("null label → defaults to POSITIVE", () => {
    expect(
      resolvePointVariant(POINT, { shiftKey: false }, null as never)
    ).toBe(POSITIVE_POINT_VARIANT);
  });

  it("label without a DetectionOverlay + shift → flips default to NEGATIVE", () => {
    const labelWithNonDetectionOverlay = { overlay: {} } as never;
    expect(
      resolvePointVariant(POINT, { shiftKey: true }, labelWithNonDetectionOverlay)
    ).toBe(NEGATIVE_POINT_VARIANT);
  });

  it("forwards the relative point to containsMaskPixel verbatim", () => {
    const overlay = new hoisted.MockDetectionOverlay();
    const spy = vi.spyOn(overlay, "containsMaskPixel");
    const label = { overlay } as never;

    resolvePointVariant({ x: 0.7, y: 0.3 }, { shiftKey: false }, label);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ x: 0.7, y: 0.3 });
  });
});
