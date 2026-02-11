import { describe, expect, it } from "vitest";
import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";
import {
  PRECISION,
  round,
  roundDetection,
  roundPolyline,
  roundTuple,
} from "./rounding-utils";

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createDetection(
  id: string,
  overrides: Partial<ReconciledDetection3D> = {}
): ReconciledDetection3D {
  return {
    _id: id,
    _cls: "Detection",
    type: "Detection",
    path: "predictions",
    location: [0, 0, 0],
    dimensions: [1, 1, 1],
    rotation: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    selected: false,
    sampleId: "sample1",
    tags: [],
    ...overrides,
  };
}

function createPolyline(
  id: string,
  overrides: Partial<ReconciledPolyline3D> = {}
): ReconciledPolyline3D {
  return {
    _id: id,
    _cls: "Polyline",
    type: "Polyline",
    path: "predictions",
    points3d: [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
    ],
    selected: false,
    sampleId: "sample1",
    tags: [],
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("round", () => {
  it("rounds to PRECISION decimal places", () => {
    expect(round(1.123456789)).toBe(1.123457);
    expect(round(0.000001)).toBe(0.000001);
    expect(round(0.0000001)).toBe(0);
  });

  it("handles whole numbers", () => {
    expect(round(5)).toBe(5);
    expect(round(0)).toBe(0);
    expect(round(-10)).toBe(-10);
  });

  it("handles negative numbers", () => {
    expect(round(-1.123456789)).toBe(-1.123457);
    expect(round(-0.000001)).toBe(-0.000001);
  });

  it("handles very small numbers", () => {
    expect(round(1e-7)).toBe(0);
    expect(round(1e-6)).toBe(0.000001);
  });

  it("handles very large numbers", () => {
    expect(round(123456.123456789)).toBe(123456.123457);
    expect(round(1e10)).toBe(1e10);
  });
});

describe("roundTuple", () => {
  it("rounds each element in a tuple", () => {
    const tuple: [number, number, number] = [1.1234567, 2.2345678, 3.3456789];
    const result = roundTuple(tuple);
    expect(result).toEqual([1.123457, 2.234568, 3.345679]);
  });

  it("handles quaternion tuples", () => {
    const quaternion: [number, number, number, number] = [
      0.1234567, 0.2345678, 0.3456789, 0.9,
    ];
    const result = roundTuple(quaternion);
    expect(result).toEqual([0.123457, 0.234568, 0.345679, 0.9]);
  });

  it("handles zero tuple", () => {
    const tuple: [number, number, number] = [0, 0, 0];
    expect(roundTuple(tuple)).toEqual([0, 0, 0]);
  });

  it("handles negative values", () => {
    const tuple: [number, number, number] = [
      -1.1234567, -2.2345678, -3.3456789,
    ];
    const result = roundTuple(tuple);
    expect(result).toEqual([-1.123457, -2.234568, -3.345679]);
  });

  it("preserves tuple type", () => {
    const input: [number, number] = [1.5, 2.5];
    const result = roundTuple(input);
    expect(result.length).toBe(2);
    expect(result).toEqual([1.5, 2.5]);
  });
});

describe("PRECISION constant", () => {
  it("is set to 6", () => {
    expect(PRECISION).toBe(6);
  });
});

describe("roundDetection", () => {
  it("rounds location to PRECISION decimal places", () => {
    const detection = createDetection("det1", {
      location: [1.1234567, 2.2345678, 3.3456789],
    });

    const result = roundDetection(detection);

    expect(result.location).toEqual([1.123457, 2.234568, 3.345679]);
  });

  it("rounds dimensions to PRECISION decimal places", () => {
    const detection = createDetection("det1", {
      dimensions: [1.1234567, 2.2345678, 3.3456789],
    });

    const result = roundDetection(detection);

    expect(result.dimensions).toEqual([1.123457, 2.234568, 3.345679]);
  });

  it("rounds rotation when present", () => {
    const detection = createDetection("det1", {
      rotation: [0.1234567, 0.2345678, 0.3456789],
    });

    const result = roundDetection(detection);

    expect(result.rotation).toEqual([0.123457, 0.234568, 0.345679]);
  });

  it("rounds quaternion when present", () => {
    const detection = createDetection("det1", {
      quaternion: [0.1234567, 0.2345678, 0.3456789, 0.9123456],
    });

    const result = roundDetection(detection);

    expect(result.quaternion).toEqual([0.123457, 0.234568, 0.345679, 0.912346]);
  });

  it("handles undefined rotation", () => {
    const detection = createDetection("det1", {
      rotation: undefined,
    });

    const result = roundDetection(detection);

    expect(result.rotation).toBeUndefined();
  });

  it("handles undefined quaternion", () => {
    const detection = createDetection("det1", {
      quaternion: undefined,
    });

    const result = roundDetection(detection);

    expect(result.quaternion).toBeUndefined();
  });

  it("preserves other properties", () => {
    const detection = createDetection("det1", {
      path: "custom_path",
      selected: true,
      tags: ["tag1", "tag2"],
    });

    const result = roundDetection(detection);

    expect(result._id).toBe("det1");
    expect(result.path).toBe("custom_path");
    expect(result.selected).toBe(true);
    expect(result.tags).toEqual(["tag1", "tag2"]);
  });

  it("does not mutate original detection", () => {
    const detection = createDetection("det1", {
      location: [1.1234567, 2.2345678, 3.3456789],
    });

    roundDetection(detection);

    expect(detection.location).toEqual([1.1234567, 2.2345678, 3.3456789]);
  });
});

describe("roundPolyline", () => {
  it("rounds all points in all segments", () => {
    const polyline = createPolyline("poly1", {
      points3d: [
        [
          [1.1234567, 2.2345678, 3.3456789],
          [4.4567891, 5.5678912, 6.6789123],
        ],
        [[7.7891234, 8.8912345, 9.9123456]],
      ],
    });

    const result = roundPolyline(polyline);

    expect(result.points3d).toEqual([
      [
        [1.123457, 2.234568, 3.345679],
        [4.456789, 5.567891, 6.678912],
      ],
      [[7.789123, 8.891235, 9.912346]],
    ]);
  });

  it("handles empty segments", () => {
    const polyline = createPolyline("poly1", {
      points3d: [],
    });

    const result = roundPolyline(polyline);

    expect(result.points3d).toEqual([]);
  });

  it("handles single point segment", () => {
    const polyline = createPolyline("poly1", {
      points3d: [[[1.1234567, 2.2345678, 3.3456789]]],
    });

    const result = roundPolyline(polyline);

    expect(result.points3d).toEqual([[[1.123457, 2.234568, 3.345679]]]);
  });

  it("preserves other properties", () => {
    const polyline = createPolyline("poly1", {
      path: "custom_path",
      selected: true,
      tags: ["tag1"],
      filled: true,
      closed: true,
    });

    const result = roundPolyline(polyline);

    expect(result._id).toBe("poly1");
    expect(result.path).toBe("custom_path");
    expect(result.selected).toBe(true);
    expect(result.tags).toEqual(["tag1"]);
    expect(result.filled).toBe(true);
    expect(result.closed).toBe(true);
  });

  it("does not mutate original polyline", () => {
    const polyline = createPolyline("poly1", {
      points3d: [[[1.1234567, 2.2345678, 3.3456789]]],
    });

    roundPolyline(polyline);

    expect(polyline.points3d[0][0]).toEqual([1.1234567, 2.2345678, 3.3456789]);
  });
});
