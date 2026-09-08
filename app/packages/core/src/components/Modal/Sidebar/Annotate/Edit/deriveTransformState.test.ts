import { DetectionLabel } from "@fiftyone/looker";
import { describe, expect, it } from "vitest";
import { deriveTransformState } from "./deriveTransformState";

const baseLabel: DetectionLabel = {
  _id: "label-1",
  _cls: "Detection",
  location: [1, 2, 3],
  dimensions: [4, 5, 6],
};

describe("deriveTransformState", () => {
  it("returns null for null/undefined input", () => {
    expect(deriveTransformState(null)).toBeNull();
    expect(deriveTransformState(undefined)).toBeNull();
  });

  it("returns null for a non-Detection label", () => {
    expect(
      deriveTransformState({
        ...baseLabel,
        _cls: "Polyline" as DetectionLabel["_cls"],
      }),
    ).toBeNull();
  });

  it("returns null when location is missing", () => {
    const { location: _location, ...rest } = baseLabel;
    expect(deriveTransformState(rest)).toBeNull();
  });

  it("returns null when dimensions is missing", () => {
    const { dimensions: _dimensions, ...rest } = baseLabel;
    expect(deriveTransformState(rest)).toBeNull();
  });

  it("derives position and dimensions directly from location/dimensions", () => {
    const result = deriveTransformState(baseLabel);
    expect(result).toEqual({
      position: { x: 1, y: 2, z: 3 },
      dimensions: { lx: 4, ly: 5, lz: 6 },
      rotation: { rx: 0, ry: 0, rz: 0 },
    });
  });

  it("prefers quaternion over rotation when both are present", () => {
    // Identity quaternion -> zero rotation, even though `rotation` below
    // claims a non-zero value — quaternion is the source of truth.
    const result = deriveTransformState({
      ...baseLabel,
      quaternion: [0, 0, 0, 1],
      rotation: [1, 1, 1],
    });
    // `-0`/`0` from the underlying Euler conversion are numerically
    // equivalent, so compare with toBeCloseTo rather than toEqual.
    expect(result?.rotation.rx).toBeCloseTo(0, 6);
    expect(result?.rotation.ry).toBeCloseTo(0, 6);
    expect(result?.rotation.rz).toBeCloseTo(0, 6);
  });

  it("falls back to the stored rotation when there's no quaternion", () => {
    const result = deriveTransformState({
      ...baseLabel,
      rotation: [0.1, 0.2, 0.3],
    });
    expect(result?.rotation).toEqual({ rx: 0.1, ry: 0.2, rz: 0.3 });
  });

  it("falls back to zero rotation when neither quaternion nor rotation is present", () => {
    const result = deriveTransformState(baseLabel);
    expect(result?.rotation).toEqual({ rx: 0, ry: 0, rz: 0 });
  });
});
