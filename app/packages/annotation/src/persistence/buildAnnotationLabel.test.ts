/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// We provide real classes for the lighter overlay types so the SUT's
// `instanceof DetectionOverlay` checks match instances we construct in the
// test. The trick is the same one used in useLighterDeltaSupplier.test.ts:
// both the SUT and the test import from "@fiftyone/lighter", and vitest
// resolves to the mock here.

const hoisted = vi.hoisted(() => {
  class MockBaseOverlay {
    public isPersistent = true;
  }
  class MockDetectionOverlay extends MockBaseOverlay {
    public field = "predictions";
    public id = "ov-1";
    public relativeBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    public label: Record<string, unknown> = { label: "cat" };
    private _hasMask = false;
    private _pendingMask: unknown = undefined;
    setHasMask(v: boolean) {
      this._hasMask = v;
    }
    setPendingMask(v: unknown) {
      this._pendingMask = v;
    }
    hasMask(): boolean {
      return this._hasMask;
    }
    getPendingMask(): unknown {
      return this._pendingMask;
    }
  }
  class MockClassificationOverlay extends MockBaseOverlay {
    public field = "weather";
    public label: Record<string, unknown> = { label: "sunny" };
  }
  class MockPolylineOverlay extends MockBaseOverlay {
    public field = "lanes";
    public label: Record<string, unknown> = { label: "lane" };
    private _points = [
      [
        [0, 0],
        [1, 1],
      ],
    ];
    private _closed = false;
    private _filled = false;
    setClosed(v: boolean) {
      this._closed = v;
    }
    setFilled(v: boolean) {
      this._filled = v;
    }
    getNestedPoints() {
      return this._points;
    }
    getClosed() {
      return this._closed;
    }
    getFilled() {
      return this._filled;
    }
  }
  class MockKeypointOverlay extends MockBaseOverlay {
    public field = "kps";
    public label: Record<string, unknown> = { label: "kp" };
  }
  return {
    MockBaseOverlay,
    MockDetectionOverlay,
    MockClassificationOverlay,
    MockPolylineOverlay,
    MockKeypointOverlay,
  };
});

vi.mock("@fiftyone/lighter", () => ({
  BaseOverlay: hoisted.MockBaseOverlay,
  DetectionOverlay: hoisted.MockDetectionOverlay,
  ClassificationOverlay: hoisted.MockClassificationOverlay,
  PolylineOverlay: hoisted.MockPolylineOverlay,
  KeypointOverlay: hoisted.MockKeypointOverlay,
}));

vi.mock("@fiftyone/looker", () => ({}));
vi.mock("@fiftyone/looker/src/overlays/classifications", () => ({}));
vi.mock("@fiftyone/looker/src/overlays/polyline", () => ({}));
vi.mock("@fiftyone/looker/src/state", () => ({ BoundingBox: undefined }));

const mockHasValidBounds = vi.fn().mockReturnValue(true);
vi.mock("@fiftyone/utilities", () => ({
  hasValidBounds: (...args: unknown[]) => mockHasValidBounds(...args),
}));

import { buildAnnotationLabel } from "./buildAnnotationLabel";

// ── Helpers ──────────────────────────────────────────────────────────────────

const detection = () => new hoisted.MockDetectionOverlay();

const dataOf = (
  result: ReturnType<typeof buildAnnotationLabel>,
): Record<string, unknown> => {
  expect(result).toBeDefined();
  return (result as { data: Record<string, unknown> }).data;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildAnnotationLabel — Detection mask serialization", () => {
  beforeEach(() => {
    mockHasValidBounds.mockReturnValue(true);
  });

  it("mask-include: hasMask=true with persisted mask bytes → output includes mask", () => {
    const overlay = detection();
    const persistedMask = new Uint8Array([1, 2, 3]);
    overlay.label = { label: "cat", mask: persistedMask };
    overlay.setHasMask(true);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect(data.mask).toBe(persistedMask);
    expect("mask_path" in data).toBe(false);
  });

  it("mask-include-pending: pendingMask present → overrides persisted mask", () => {
    const overlay = detection();
    const persistedMask = new Uint8Array([1, 2, 3]);
    const pendingMask = new Uint8Array([9, 9, 9]);
    overlay.label = { label: "cat", mask: persistedMask };
    overlay.setHasMask(true);
    overlay.setPendingMask(pendingMask);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect(data.mask).toBe(pendingMask);
    expect(data.mask).not.toBe(persistedMask);
  });

  it("mask-include-empty: hasMask=true but no _mask and no pendingMask → no mask key emitted", () => {
    const overlay = detection();
    overlay.label = { label: "cat" };
    overlay.setHasMask(true);
    overlay.setPendingMask(undefined);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect("mask" in data).toBe(false);
    expect("mask_path" in data).toBe(false);
  });

  it("mask-clear: hasMask=false but _mask was set → emit {mask: null, mask_path: null} to clear server-side", () => {
    const overlay = detection();
    overlay.label = { label: "cat", mask: new Uint8Array([1, 2, 3]) };
    overlay.setHasMask(false);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect(data.mask).toBeNull();
    expect(data.mask_path).toBeNull();
  });

  it("mask-clear-by-path: hasMask=false but mask_path was set → also emits null for both", () => {
    const overlay = detection();
    overlay.label = { label: "cat", mask_path: "/path/to/mask.png" };
    overlay.setHasMask(false);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect(data.mask).toBeNull();
    expect(data.mask_path).toBeNull();
  });

  it("mask-noop: hasMask=false and no prior mask data → no mask/mask_path keys emitted", () => {
    const overlay = detection();
    overlay.label = { label: "cat" };
    overlay.setHasMask(false);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect("mask" in data).toBe(false);
    expect("mask_path" in data).toBe(false);
  });

  it("strips the original mask/mask_path keys before re-emitting (no leakage of pre-decision values)", () => {
    const overlay = detection();
    const persistedMask = new Uint8Array([1, 2, 3]);
    overlay.label = {
      label: "cat",
      mask: persistedMask,
      mask_path: "/should-not-leak.png",
      confidence: 0.9,
    };
    overlay.setHasMask(true);

    const data = dataOf(buildAnnotationLabel(overlay as never));

    expect(data.confidence).toBe(0.9);
    expect("mask_path" in data).toBe(false);
    expect(data.mask).toBe(persistedMask);
  });
});

describe("buildAnnotationLabel — Detection envelope", () => {
  beforeEach(() => mockHasValidBounds.mockReturnValue(true));

  it("emits type=Detection, the relative bounding box, the overlay's field, and includes the label text", () => {
    const overlay = detection();
    overlay.relativeBounds = { x: 0.05, y: 0.1, width: 0.2, height: 0.3 };
    overlay.field = "instances";
    overlay.label = { label: "dog" };

    const result = buildAnnotationLabel(overlay as never);

    expect(result).toEqual({
      type: "Detection",
      data: { label: "dog" },
      boundingBox: [0.05, 0.1, 0.2, 0.3],
      path: "instances",
    });
  });

  it("persists Detection even when label.label is empty (no label-text gate)", () => {
    const overlay = detection();
    overlay.label = { label: "" };

    expect(buildAnnotationLabel(overlay as never)?.type).toBe("Detection");
  });

  it("returns undefined when bounds are not valid (no committed bbox yet)", () => {
    const overlay = detection();
    mockHasValidBounds.mockReturnValue(false);

    expect(buildAnnotationLabel(overlay as never)).toBeUndefined();
  });
});

describe("buildAnnotationLabel — non-Detection types", () => {
  it("Classification: emits type=Classification with the label and field", () => {
    const overlay = new hoisted.MockClassificationOverlay();
    overlay.field = "weather";
    overlay.label = { label: "sunny" };

    expect(buildAnnotationLabel(overlay as never)).toEqual({
      type: "Classification",
      data: { label: "sunny" },
      path: "weather",
    });
  });

  it("Classification: persists even when label.label is empty (no label-text gate)", () => {
    const overlay = new hoisted.MockClassificationOverlay();
    overlay.label = { label: "" };

    expect(buildAnnotationLabel(overlay as never)?.type).toBe("Classification");
  });

  it("Polyline: emits points, closed, filled from getters; always returns (no label gate)", () => {
    const overlay = new hoisted.MockPolylineOverlay();
    overlay.field = "lanes";
    overlay.setClosed(true);
    overlay.setFilled(true);

    const result = buildAnnotationLabel(overlay as never);

    expect(result?.type).toBe("Polyline");
    expect(
      (result as { data: { closed: boolean; filled: boolean } }).data.closed,
    ).toBe(true);
    expect(
      (result as { data: { closed: boolean; filled: boolean } }).data.filled,
    ).toBe(true);
    expect(result?.path).toBe("lanes");
  });

  it("Keypoint: emits type=Keypoint when label.label is set", () => {
    const overlay = new hoisted.MockKeypointOverlay();
    overlay.field = "kps";
    overlay.label = { label: "nose" };

    expect(buildAnnotationLabel(overlay as never)).toEqual({
      type: "Keypoint",
      data: { label: "nose" },
      path: "kps",
    });
  });

  it("Keypoint: persists even when label.label is empty (no label-text gate)", () => {
    const overlay = new hoisted.MockKeypointOverlay();
    overlay.label = { label: "" };

    expect(buildAnnotationLabel(overlay as never)?.type).toBe("Keypoint");
  });

  it("unknown overlay (BaseOverlay only): returns undefined", () => {
    const overlay = new hoisted.MockBaseOverlay();

    expect(buildAnnotationLabel(overlay as never)).toBeUndefined();
  });
});
