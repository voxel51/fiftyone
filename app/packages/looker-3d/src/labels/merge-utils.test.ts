import { describe, expect, it, vi } from "vitest";
import type {
  CuboidTransformData,
  PolylinePointTransformData,
} from "../annotation/types";
import type { OverlayLabel } from "./loader";
import {
  createNewDetection,
  createNewPolyline,
  reconcileDetection,
  reconcilePolyline,
} from "./merge-utils";

// Mock the coerceStringBooleans function
vi.mock("@fiftyone/core/src/components/Modal/Sidebar/Annotate", () => ({
  coerceStringBooleans: vi.fn((obj) => obj),
}));

// Helper to create a base overlay label for testing
const createBaseOverlayLabel = (
  overrides: Partial<OverlayLabel> = {}
): OverlayLabel => ({
  _id: "test-label-id",
  _cls: "Detection",
  path: "test.path",
  selected: false,
  color: "#ff0000",
  label: "test-label",
  sampleId: "sample-123",
  ...overrides,
});

describe("reconcileDetection", () => {
  it("returns overlay unchanged when no staged transform provided", () => {
    const overlay = createBaseOverlayLabel({
      _cls: "Detection",
    });

    const result = reconcileDetection(overlay);

    expect(result._id).toBe(overlay._id);
    expect(result._cls).toBe("Detection");
    expect(result.path).toBe(overlay.path);
    expect(result.color).toBe(overlay.color);
  });

  it("returns overlay unchanged when staged transform is undefined", () => {
    const overlay = createBaseOverlayLabel({
      _cls: "Detection",
    });

    const result = reconcileDetection(overlay, undefined);

    expect(result._id).toBe(overlay._id);
    expect(result._cls).toBe("Detection");
  });

  it("merges staged transform with overlay, with transform taking precedence", () => {
    const overlay = createBaseOverlayLabel({
      _cls: "Detection",
    }) as OverlayLabel & {
      location: [number, number, number];
      dimensions: [number, number, number];
    };
    overlay.location = [0, 0, 0];
    overlay.dimensions = [1, 1, 1];

    const stagedTransform: CuboidTransformData = {
      location: [5, 10, 15],
      dimensions: [2, 3, 4],
      rotation: [0.1, 0.2, 0.3],
    };

    const result = reconcileDetection(overlay, stagedTransform);

    // Staged transform values should override overlay values
    expect(result.location).toEqual([5, 10, 15]);
    expect(result.dimensions).toEqual([2, 3, 4]);
    expect(result.rotation).toEqual([0.1, 0.2, 0.3]);

    // Original overlay properties should be preserved
    expect(result._id).toBe(overlay._id);
    expect(result.path).toBe(overlay.path);
    expect(result.color).toBe(overlay.color);
  });

  it("preserves quaternion from staged transform", () => {
    const overlay = createBaseOverlayLabel({ _cls: "Detection" });

    const stagedTransform: CuboidTransformData = {
      location: [1, 2, 3],
      dimensions: [1, 1, 1],
      quaternion: [0, 0, 0.707, 0.707],
    };

    const result = reconcileDetection(overlay, stagedTransform);

    expect(result.quaternion).toEqual([0, 0, 0.707, 0.707]);
  });
});

describe("reconcilePolyline", () => {
  const createPolylineOverlay = (
    points3d: [number, number, number][][],
    overrides: Partial<OverlayLabel> = {}
  ): OverlayLabel & { points3d: [number, number, number][][] } => ({
    ...createBaseOverlayLabel({ _cls: "Polyline", ...overrides }),
    points3d,
  });

  it("returns overlay with original points when no staged transform provided", () => {
    const originalPoints: [number, number, number][][] = [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ];
    const overlay = createPolylineOverlay(originalPoints);

    const result = reconcilePolyline(overlay);

    expect(result.points3d).toEqual(originalPoints);
    expect(result._id).toBe(overlay._id);
  });

  it("uses staged segments when provided, overriding original points", () => {
    const originalPoints: [number, number, number][][] = [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ];
    const overlay = createPolylineOverlay(originalPoints);

    const stagedTransform: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [10, 20, 30],
            [40, 50, 60],
          ],
        },
      ],
    };

    const result = reconcilePolyline(overlay, stagedTransform);

    expect(result.points3d).toEqual([
      [
        [10, 20, 30],
        [40, 50, 60],
      ],
    ]);
  });

  it("handles multiple segments from staged transform", () => {
    const overlay = createPolylineOverlay([
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ]);

    const stagedTransform: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [1, 1, 1],
            [2, 2, 2],
          ],
        },
        {
          points: [
            [3, 3, 3],
            [4, 4, 4],
          ],
        },
      ],
    };

    const result = reconcilePolyline(overlay, stagedTransform);

    expect(result.points3d).toHaveLength(2);
    expect(result.points3d[0]).toEqual([
      [1, 1, 1],
      [2, 2, 2],
    ]);
    expect(result.points3d[1]).toEqual([
      [3, 3, 3],
      [4, 4, 4],
    ]);
  });

  it("filters out invalid segments (empty arrays)", () => {
    const overlay = createPolylineOverlay([]);

    const stagedTransform: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [1, 1, 1],
            [2, 2, 2],
          ],
        },
        { points: [] }, // Invalid - empty
        {
          points: [
            [3, 3, 3],
            [4, 4, 4],
          ],
        },
      ],
    };

    const result = reconcilePolyline(overlay, stagedTransform);

    // Empty segment should be filtered out
    expect(result.points3d).toHaveLength(2);
  });

  it("preserves original overlay properties", () => {
    const overlay = createPolylineOverlay(
      [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      ],
      {
        color: "#00ff00",
        label: "my-polyline",
      }
    );

    const result = reconcilePolyline(overlay);

    expect(result.color).toBe("#00ff00");
    expect(result.label).toBe("my-polyline");
  });

  it("applies misc properties from staged transform", () => {
    const overlay = createPolylineOverlay([
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ]);

    const stagedTransform: PolylinePointTransformData = {
      segments: [],
      misc: {
        filled: true,
        closed: false,
      },
    };

    const result = reconcilePolyline(overlay, stagedTransform);

    expect(result.filled).toBe(true);
    expect(result.closed).toBe(false);
  });
});

describe("createNewDetection", () => {
  it("creates a new detection with all required properties", () => {
    const labelId = "new-detection-123";
    const transformData: CuboidTransformData = {
      location: [10, 20, 30],
      dimensions: [5, 10, 15],
      rotation: [0.1, 0.2, 0.3],
    };
    const currentSampleId = "sample-456";
    const path = "predictions.detections";

    const result = createNewDetection(
      labelId,
      transformData,
      currentSampleId,
      path
    );

    expect(result._id).toBe(labelId);
    expect(result._cls).toBe("Detection");
    expect((result as unknown as Record<string, unknown>).type).toBe(
      "Detection"
    );
    expect(result.path).toBe(path);
    expect(result.location).toEqual([10, 20, 30]);
    expect(result.dimensions).toEqual([5, 10, 15]);
    expect(result.rotation).toEqual([0.1, 0.2, 0.3]);
    expect(result.sampleId).toBe(currentSampleId);
    expect(result.isNew).toBe(true);
    expect(result.selected).toBe(false);
    expect((result as unknown as Record<string, unknown>).tags).toEqual([]);
  });

  it("uses default rotation when not provided", () => {
    const transformData: CuboidTransformData = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
    };

    const result = createNewDetection("id", transformData, "sample-id", "path");

    expect(result.rotation).toEqual([0, 0, 0]);
  });

  it("preserves quaternion when provided", () => {
    const transformData: CuboidTransformData = {
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
      quaternion: [0, 0, 0.707, 0.707],
    };

    const result = createNewDetection("id", transformData, "sample-id", "path");

    expect(result.quaternion).toEqual([0, 0, 0.707, 0.707]);
  });
});

describe("createNewPolyline", () => {
  it("creates a new polyline with valid segments", () => {
    const labelId = "new-polyline-123";
    const transformData: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
        {
          points: [
            [7, 8, 9],
            [10, 11, 12],
          ],
        },
      ],
      path: "predictions.polylines",
      label: "my-polyline",
    };
    const currentSampleId = "sample-789";

    const result = createNewPolyline(labelId, transformData, currentSampleId);

    expect(result).not.toBeNull();
    expect(result!._id).toBe(labelId);
    expect(result!._cls).toBe("Polyline");
    expect((result as unknown as Record<string, unknown>).type).toBe(
      "Polyline"
    );
    expect(result!.path).toBe("predictions.polylines");
    expect(result!.label).toBe("my-polyline");
    expect(result!.sampleId).toBe(currentSampleId);
    expect(result!.isNew).toBe(true);
    expect(result!.selected).toBe(false);
    expect((result as unknown as Record<string, unknown>).tags).toEqual([]);
    expect(result!.points3d).toHaveLength(2);
  });

  it("returns null when segments is undefined", () => {
    const transformData: PolylinePointTransformData = {
      segments: undefined as unknown as PolylinePointTransformData["segments"],
    };

    const result = createNewPolyline("id", transformData, "sample-id");

    expect(result).toBeNull();
  });

  it("returns null when segments array is empty", () => {
    const transformData: PolylinePointTransformData = {
      segments: [],
    };

    const result = createNewPolyline("id", transformData, "sample-id");

    expect(result).toBeNull();
  });

  it("uses empty string for path when not provided", () => {
    const transformData: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
      ],
    };

    const result = createNewPolyline("id", transformData, "sample-id");

    expect(result!.path).toBe("");
  });

  it("applies misc properties to the new polyline", () => {
    const transformData: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
      ],
      misc: {
        filled: true,
        closed: true,
        customProp: "value",
      },
    };

    const result = createNewPolyline("id", transformData, "sample-id");

    expect(result!.filled).toBe(true);
    expect(result!.closed).toBe(true);
  });

  it("correctly maps segment points to points3d array", () => {
    const transformData: PolylinePointTransformData = {
      segments: [
        {
          points: [
            [0, 0, 0],
            [1, 1, 1],
            [2, 2, 2],
          ],
        },
        {
          points: [
            [5, 5, 5],
            [6, 6, 6],
          ],
        },
      ],
    };

    const result = createNewPolyline("id", transformData, "sample-id");

    expect(result!.points3d).toEqual([
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [
        [5, 5, 5],
        [6, 6, 6],
      ],
    ]);
  });
});
