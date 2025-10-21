import type { Vector3Tuple } from "three";
import { describe, expect, it } from "vitest";
import { SNAP_TOLERANCE } from "../../constants";
import type { PolylinePointTransform } from "../types";
import {
  applyDeltaToAllPoints,
  applyTransformsToPolyline,
  calculatePolylineCentroid,
  findClickedSegment,
  findClosestPointOnSegment,
  findSharedPointSegments,
  getCurrentVertexPosition,
  getVertexPosition,
  insertVertexInSegment,
  shouldClosePolylineLoop,
  updateDuplicateVertices,
} from "./polyline-utils";

// Import the positionsEqual function for testing (it's not exported, so we'll test it indirectly)
// We'll test it through findSharedPointSegments which uses it internally

describe("getVertexPosition", () => {
  const mockPoints3d: Vector3Tuple[][] = [
    [
      [0, 0, 0],
      [1, 1, 1],
    ],
    [
      [2, 2, 2],
      [3, 3, 3],
    ],
  ];

  it("returns transformed position when transform exists", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
    ];
    const selectedPoint = { segmentIndex: 0, pointIndex: 0, labelId: "test" };

    const result = getVertexPosition(selectedPoint, mockPoints3d, transforms);

    expect(result).toEqual([5, 5, 5]);
  });

  it("returns original position when no transform exists", () => {
    const transforms: PolylinePointTransform[] = [];
    const selectedPoint = { segmentIndex: 0, pointIndex: 0, labelId: "test" };

    const result = getVertexPosition(selectedPoint, mockPoints3d, transforms);

    expect(result).toEqual([0, 0, 0]);
  });

  it("returns null for invalid segment index", () => {
    const transforms: PolylinePointTransform[] = [];
    const selectedPoint = { segmentIndex: 5, pointIndex: 0, labelId: "test" };

    const result = getVertexPosition(selectedPoint, mockPoints3d, transforms);

    expect(result).toBeNull();
  });

  it("returns null for invalid point index", () => {
    const transforms: PolylinePointTransform[] = [];
    const selectedPoint = { segmentIndex: 0, pointIndex: 5, labelId: "test" };

    const result = getVertexPosition(selectedPoint, mockPoints3d, transforms);

    expect(result).toBeNull();
  });

  it("handles empty transforms array", () => {
    const transforms: PolylinePointTransform[] = [];
    const selectedPoint = { segmentIndex: 0, pointIndex: 0, labelId: "test" };

    const result = getVertexPosition(selectedPoint, mockPoints3d, transforms);

    expect(result).toEqual([0, 0, 0]);
  });

  it("handles empty points3d array", () => {
    const transforms: PolylinePointTransform[] = [];
    const selectedPoint = { segmentIndex: 0, pointIndex: 0, labelId: "test" };

    const result = getVertexPosition(selectedPoint, [], transforms);

    expect(result).toBeNull();
  });
});

describe("calculatePolylineCentroid", () => {
  it("calculates correct centroid for single segment", () => {
    const points3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [2, 2, 2],
        [4, 4, 4],
      ],
    ];

    const result = calculatePolylineCentroid(points3d);

    expect(result).toEqual([2, 2, 2]);
  });

  it("calculates correct centroid for multiple segments", () => {
    const points3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [2, 2, 2],
      ],
      [
        [4, 4, 4],
        [6, 6, 6],
      ],
    ];

    const result = calculatePolylineCentroid(points3d);

    expect(result).toEqual([3, 3, 3]);
  });

  it("returns [0,0,0] for empty points array", () => {
    const result = calculatePolylineCentroid([]);

    expect(result).toEqual([0, 0, 0]);
  });

  it("handles single point", () => {
    const points3d: Vector3Tuple[][] = [[[5, 10, 15]]];

    const result = calculatePolylineCentroid(points3d);

    expect(result).toEqual([5, 10, 15]);
  });

  it("handles points with negative coordinates", () => {
    const points3d: Vector3Tuple[][] = [
      [
        [-1, -2, -3],
        [1, 2, 3],
      ],
    ];

    const result = calculatePolylineCentroid(points3d);

    expect(result).toEqual([0, 0, 0]);
  });

  it("handles very large coordinate values", () => {
    const points3d: Vector3Tuple[][] = [
      [
        [1000000, 2000000, 3000000],
        [2000000, 4000000, 6000000],
      ],
    ];

    const result = calculatePolylineCentroid(points3d);

    expect(result).toEqual([1500000, 3000000, 4500000]);
  });
});

describe("findSharedPointSegments", () => {
  it("finds all segments sharing a point", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 1, position: [1, 1, 1] },
      { segmentIndex: 1, pointIndex: 0, position: [1, 1, 1] },
      { segmentIndex: 2, pointIndex: 0, position: [2, 2, 2] },
    ];
    const position: [number, number, number] = [1, 1, 1];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0, 1]);
  });

  it("returns empty array when no segments share point", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [1, 1, 1] },
    ];
    const position: [number, number, number] = [2, 2, 2];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([]);
  });

  it("handles floating point precision issues with epsilon tolerance", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0.1, 0.2, 0.3] },
      { segmentIndex: 1, pointIndex: 0, position: [0.1, 0.2, 0.3] },
    ];
    const position: [number, number, number] = [0.1, 0.2, 0.3];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0, 1]);
  });

  it("handles floating point precision with small differences within epsilon", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0.1, 0.2, 0.3] },
      {
        segmentIndex: 1,
        pointIndex: 0,
        position: [0.1000001, 0.2000001, 0.3000001],
      },
      { segmentIndex: 2, pointIndex: 0, position: [0.1, 0.2, 0.3] },
    ];
    const position: [number, number, number] = [0.1, 0.2, 0.3];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0, 1, 2]);
  });

  it("rejects positions with differences larger than epsilon", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0.1, 0.2, 0.3] },
      { segmentIndex: 1, pointIndex: 0, position: [0.1, 0.2, 0.3] },
    ];
    const position: [number, number, number] = [0.1, 0.2, 0.4]; // Different Z coordinate

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([]);
  });

  it("handles very small epsilon differences", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [1.0, 2.0, 3.0] },
      {
        segmentIndex: 1,
        pointIndex: 0,
        position: [1.0000005, 2.0000005, 3.0000005],
      },
    ];
    const position: [number, number, number] = [1.0, 2.0, 3.0];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0, 1]);
  });

  it("handles negative coordinates with epsilon tolerance", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [-1.0, -2.0, -3.0] },
      {
        segmentIndex: 1,
        pointIndex: 0,
        position: [-1.0000001, -2.0000001, -3.0000001],
      },
    ];
    const position: [number, number, number] = [-1.0, -2.0, -3.0];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0, 1]);
  });

  it("handles duplicate transforms", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [1, 1, 1] },
      { segmentIndex: 0, pointIndex: 0, position: [1, 1, 1] },
    ];
    const position: [number, number, number] = [1, 1, 1];

    const result = findSharedPointSegments(transforms, position);

    expect(result).toEqual([0]);
  });
});

describe("shouldClosePolylineLoop", () => {
  it("returns true when within snap tolerance of first vertex", () => {
    const vertices: Vector3Tuple[] = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const currentPosition: Vector3Tuple = [0.1, 0.1, 0.1];

    const result = shouldClosePolylineLoop(vertices, currentPosition, 0.5);

    expect(result).toBe(true);
  });

  it("returns false when outside snap tolerance", () => {
    const vertices: Vector3Tuple[] = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const currentPosition: Vector3Tuple = [5, 5, 5];

    const result = shouldClosePolylineLoop(vertices, currentPosition, 0.5);

    expect(result).toBe(false);
  });

  it("returns false when less than 3 vertices", () => {
    const vertices: Vector3Tuple[] = [
      [0, 0, 0],
      [1, 1, 1],
    ];
    const currentPosition: Vector3Tuple = [0, 0, 0];

    const result = shouldClosePolylineLoop(vertices, currentPosition);

    expect(result).toBe(false);
  });

  it("returns false for empty vertices array", () => {
    const vertices: Vector3Tuple[] = [];
    const currentPosition: Vector3Tuple = [0, 0, 0];

    const result = shouldClosePolylineLoop(vertices, currentPosition);

    expect(result).toBe(false);
  });

  it("handles exact position match", () => {
    const vertices: Vector3Tuple[] = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const currentPosition: Vector3Tuple = [0, 0, 0];

    const result = shouldClosePolylineLoop(vertices, currentPosition);

    expect(result).toBe(true);
  });

  it("handles edge case at exact tolerance boundary", () => {
    const vertices: Vector3Tuple[] = [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ];
    const currentPosition: Vector3Tuple = [SNAP_TOLERANCE, 0, 0];

    const result = shouldClosePolylineLoop(vertices, currentPosition);

    expect(result).toBe(false);
  });
});

describe("getCurrentVertexPosition", () => {
  const mockOriginalPoints: Vector3Tuple[][] = [
    [
      [0, 0, 0],
      [1, 1, 1],
    ],
    [
      [2, 2, 2],
      [3, 3, 3],
    ],
  ];

  it("returns transformed position when available", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
    ];

    const result = getCurrentVertexPosition(
      0,
      0,
      mockOriginalPoints,
      transforms
    );

    expect(result).toEqual([5, 5, 5]);
  });

  it("falls back to original position", () => {
    const transforms: PolylinePointTransform[] = [];

    const result = getCurrentVertexPosition(
      0,
      0,
      mockOriginalPoints,
      transforms
    );

    expect(result).toEqual([0, 0, 0]);
  });

  it("handles missing segment in original points", () => {
    const transforms: PolylinePointTransform[] = [];

    const result = getCurrentVertexPosition(
      5,
      0,
      mockOriginalPoints,
      transforms
    );

    expect(result).toEqual([0, 0, 0]);
  });

  it("handles missing point in segment", () => {
    const transforms: PolylinePointTransform[] = [];

    const result = getCurrentVertexPosition(
      0,
      5,
      mockOriginalPoints,
      transforms
    );

    expect(result).toEqual([0, 0, 0]);
  });

  it("returns sensible default for completely invalid indices", () => {
    const transforms: PolylinePointTransform[] = [];

    const result = getCurrentVertexPosition(
      5,
      5,
      mockOriginalPoints,
      transforms
    );

    expect(result).toEqual([0, 0, 0]);
  });
});

describe("applyTransformsToPolyline", () => {
  it("applies single transform correctly", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
    ];

    const result = applyTransformsToPolyline(originalPoints, transforms);

    expect(result).toEqual([
      [
        [5, 5, 5],
        [1, 1, 1],
      ],
    ]);
  });

  it("applies multiple transforms to different points", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
      [
        [2, 2, 2],
        [3, 3, 3],
      ],
    ];
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 1, position: [6, 6, 6] },
    ];

    const result = applyTransformsToPolyline(originalPoints, transforms);

    expect(result).toEqual([
      [
        [5, 5, 5],
        [1, 1, 1],
      ],
      [
        [2, 2, 2],
        [6, 6, 6],
      ],
    ]);
  });

  it("handles transforms to non-existent segments (creates default)", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 2, pointIndex: 0, position: [5, 5, 5] },
    ];

    const result = applyTransformsToPolyline(originalPoints, transforms);

    expect(result).toEqual([
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
      undefined,
      [
        [5, 5, 5],
        [0, 0, 0],
      ],
    ]);
  });

  it("handles empty transforms array", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const transforms: PolylinePointTransform[] = [];

    const result = applyTransformsToPolyline(originalPoints, transforms);

    expect(result).toEqual([
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ]);
  });

  it("preserves untransformed points", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
    ];
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
    ];

    const result = applyTransformsToPolyline(originalPoints, transforms);

    expect(result).toEqual([
      [
        [0, 0, 0],
        [5, 5, 5],
        [2, 2, 2],
      ],
    ]);
  });
});

describe("applyDeltaToAllPoints", () => {
  it("applies delta to all points correctly", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const delta: Vector3Tuple = [2, 2, 2];

    const result = applyDeltaToAllPoints(
      effectivePoints,
      originalPoints,
      currentTransforms,
      delta
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [2, 2, 2] },
      { segmentIndex: 0, pointIndex: 1, position: [3, 3, 3] },
    ]);
  });

  it("combines with existing transforms", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [5, 5, 5],
        [1, 1, 1],
      ],
    ];
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
    ];
    const delta: Vector3Tuple = [1, 1, 1];

    const result = applyDeltaToAllPoints(
      effectivePoints,
      originalPoints,
      currentTransforms,
      delta
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [6, 6, 6] },
      { segmentIndex: 0, pointIndex: 1, position: [2, 2, 2] },
    ]);
  });

  it("handles empty points", () => {
    const effectivePoints: Vector3Tuple[][] = [];
    const originalPoints: Vector3Tuple[][] = [];
    const currentTransforms: PolylinePointTransform[] = [];
    const delta: Vector3Tuple = [1, 1, 1];

    const result = applyDeltaToAllPoints(
      effectivePoints,
      originalPoints,
      currentTransforms,
      delta
    );

    expect(result).toEqual([]);
  });

  it("handles zero delta", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const delta: Vector3Tuple = [0, 0, 0];

    const result = applyDeltaToAllPoints(
      effectivePoints,
      originalPoints,
      currentTransforms,
      delta
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: [1, 1, 1] },
    ]);
  });

  it("handles negative delta values", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [5, 5, 5],
        [3, 3, 3],
      ],
    ];
    const originalPoints: Vector3Tuple[][] = [
      [
        [5, 5, 5],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const delta: Vector3Tuple = [-1, -1, -1];

    const result = applyDeltaToAllPoints(
      effectivePoints,
      originalPoints,
      currentTransforms,
      delta
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [4, 4, 4] },
      { segmentIndex: 0, pointIndex: 1, position: [2, 2, 2] },
    ]);
  });
});

describe("updateDuplicateVertices", () => {
  it("updates all duplicate vertices across segments", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1], // This vertex appears in multiple segments
        [2, 2, 2],
      ],
      [
        [1, 1, 1], // Duplicate vertex
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("updates existing transforms for duplicate vertices", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [
        [1, 1, 1],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 1, position: [2, 2, 2] },
      { segmentIndex: 1, pointIndex: 0, position: [3, 3, 3] },
    ];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("handles vertices with no duplicates", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [
        [3, 3, 3],
        [4, 4, 4],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
    ]);
  });

  it("handles multiple segments with the same vertex", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [1, 1, 1], // First occurrence
        [2, 2, 2],
      ],
      [
        [1, 1, 1], // Second occurrence
        [3, 3, 3],
      ],
      [
        [1, 1, 1], // Third occurrence
        [4, 4, 4],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
      { segmentIndex: 2, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("preserves existing transforms for non-duplicate vertices", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [
        [1, 1, 1],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [10, 10, 10] },
      { segmentIndex: 1, pointIndex: 1, position: [20, 20, 20] },
    ];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [10, 10, 10] },
      { segmentIndex: 1, pointIndex: 1, position: [20, 20, 20] },
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("handles empty effectivePoints3d array", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([]);
  });

  it("handles empty segments in effectivePoints3d", () => {
    const movedPoint: Vector3Tuple = [1, 1, 1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [[], []];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([]);
  });

  it("handles floating point precision in vertex matching", () => {
    const movedPoint: Vector3Tuple = [1.0, 1.0, 1.0];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1.0, 1.0, 1.0], // Exact match
        [2, 2, 2],
      ],
      [
        [1.0, 1.0, 1.0], // Exact match
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("handles negative coordinates", () => {
    const movedPoint: Vector3Tuple = [-1, -1, -1];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [-1, -1, -1],
        [2, 2, 2],
      ],
      [
        [-1, -1, -1],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("handles zero coordinates", () => {
    const movedPoint: Vector3Tuple = [0, 0, 0];
    const newPosition: Vector3Tuple = [5, 5, 5];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
      ],
      [
        [0, 0, 0],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [5, 5, 5] },
      { segmentIndex: 1, pointIndex: 0, position: [5, 5, 5] },
    ]);
  });

  it("handles large coordinate values", () => {
    const movedPoint: Vector3Tuple = [1000000, 2000000, 3000000];
    const newPosition: Vector3Tuple = [5000000, 5000000, 5000000];
    const effectivePoints3d: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [1000000, 2000000, 3000000],
        [2, 2, 2],
      ],
      [
        [1000000, 2000000, 3000000],
        [3, 3, 3],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];

    const result = updateDuplicateVertices(
      movedPoint,
      newPosition,
      effectivePoints3d,
      currentTransforms
    );

    expect(result).toEqual([
      { segmentIndex: 0, pointIndex: 1, position: [5000000, 5000000, 5000000] },
      { segmentIndex: 1, pointIndex: 0, position: [5000000, 5000000, 5000000] },
    ]);
  });
});

describe("findClosestPointOnSegment", () => {
  it("finds closest point at the start of segment", () => {
    const segmentStart: Vector3Tuple = [0, 0, 0];
    const segmentEnd: Vector3Tuple = [10, 0, 0];
    const clickPosition: Vector3Tuple = [-5, 0, 0];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    expect(result.closestPoint).toEqual([0, 0, 0]);
    expect(result.t).toBe(0);
  });

  it("finds closest point at the end of segment", () => {
    const segmentStart: Vector3Tuple = [0, 0, 0];
    const segmentEnd: Vector3Tuple = [10, 0, 0];
    const clickPosition: Vector3Tuple = [15, 0, 0];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    expect(result.closestPoint).toEqual([10, 0, 0]);
    expect(result.t).toBe(1);
  });

  it("finds closest point in the middle of segment", () => {
    const segmentStart: Vector3Tuple = [0, 0, 0];
    const segmentEnd: Vector3Tuple = [10, 0, 0];
    const clickPosition: Vector3Tuple = [5, 5, 0];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    expect(result.closestPoint).toEqual([5, 0, 0]);
    expect(result.t).toBeCloseTo(0.5);
  });

  it("handles diagonal segments", () => {
    const segmentStart: Vector3Tuple = [0, 0, 0];
    const segmentEnd: Vector3Tuple = [10, 10, 10];
    const clickPosition: Vector3Tuple = [5, 5, 0];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    // The closest point should be somewhere along the diagonal
    expect(result.t).toBeGreaterThan(0);
    expect(result.t).toBeLessThan(1);
  });

  it("handles zero-length segments", () => {
    const segmentStart: Vector3Tuple = [5, 5, 5];
    const segmentEnd: Vector3Tuple = [5, 5, 5];
    const clickPosition: Vector3Tuple = [10, 10, 10];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    expect(result.closestPoint).toEqual([5, 5, 5]);
    expect(result.t).toBe(0);
  });

  it("projects perpendicular clicks correctly", () => {
    const segmentStart: Vector3Tuple = [0, 0, 0];
    const segmentEnd: Vector3Tuple = [10, 0, 0];
    const clickPosition: Vector3Tuple = [5, 100, 0];

    const result = findClosestPointOnSegment(
      segmentStart,
      segmentEnd,
      clickPosition
    );

    // Should project straight down to [5, 0, 0]
    expect(result.closestPoint[0]).toBeCloseTo(5);
    expect(result.closestPoint[1]).toBeCloseTo(0);
    expect(result.closestPoint[2]).toBeCloseTo(0);
    expect(result.t).toBeCloseTo(0.5);
  });
});

describe("insertVertexInSegment", () => {
  it("splits a simple two-point segment correctly", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const newVertexPosition: Vector3Tuple = [5, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).not.toBeNull();

    // Should create transforms for segment 0 (A->B) and segment 1 (B->C)
    expect(result!).toHaveLength(3);

    // Segment 0: point 1 should be the new vertex
    expect(
      result!.find((t) => t.segmentIndex === 0 && t.pointIndex === 1)?.position
    ).toEqual([5, 0, 0]);

    // Segment 1: point 0 should be the new vertex
    expect(
      result!.find((t) => t.segmentIndex === 1 && t.pointIndex === 0)?.position
    ).toEqual([5, 0, 0]);

    // Segment 1: point 1 should be the original end point
    expect(
      result!.find((t) => t.segmentIndex === 1 && t.pointIndex === 1)?.position
    ).toEqual([10, 0, 0]);
  });

  it("increments subsequent segment indices", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      [
        [10, 0, 0],
        [20, 0, 0],
      ],
      [
        [20, 0, 0],
        [30, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 1, pointIndex: 0, position: [12, 2, 0] },
      { segmentIndex: 2, pointIndex: 1, position: [32, 2, 0] },
    ];
    const newVertexPosition: Vector3Tuple = [5, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).not.toBeNull();

    // Original segment 1 should now be segment 2
    const segmentTwoTransforms = result!.filter((t) => t.segmentIndex === 2);
    expect(segmentTwoTransforms.length).toBeGreaterThan(0);
    expect(
      segmentTwoTransforms.find((t) => t.pointIndex === 0)?.position
    ).toEqual([12, 2, 0]);

    // Original segment 2 should now be segment 3
    const segmentThreeTransforms = result!.filter((t) => t.segmentIndex === 3);
    expect(segmentThreeTransforms.length).toBeGreaterThan(0);
    expect(
      segmentThreeTransforms.find((t) => t.pointIndex === 1)?.position
    ).toEqual([32, 2, 0]);
  });

  it("preserves transforms on the target segment's first point", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [1, 1, 1] },
      { segmentIndex: 0, pointIndex: 1, position: [11, 1, 1] },
    ];
    const newVertexPosition: Vector3Tuple = [5, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).not.toBeNull();

    // First point of segment 0 should keep its transform
    expect(
      result!.find((t) => t.segmentIndex === 0 && t.pointIndex === 0)?.position
    ).toEqual([1, 1, 1]);
  });

  it("throws error for invalid segment index", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const newVertexPosition: Vector3Tuple = [5, 0, 0];

    expect(() =>
      insertVertexInSegment(
        originalPoints,
        currentTransforms,
        5,
        newVertexPosition
      )
    ).toThrow("Invalid segment index");
  });

  it("throws error for segment with less than 2 points", () => {
    const originalPoints: Vector3Tuple[][] = [[[0, 0, 0]]];
    const currentTransforms: PolylinePointTransform[] = [];
    const newVertexPosition: Vector3Tuple = [5, 0, 0];

    expect(() =>
      insertVertexInSegment(
        originalPoints,
        currentTransforms,
        0,
        newVertexPosition
      )
    ).toThrow("must have at least 2 points");
  });

  it("handles multi-point segments (more than 2 points)", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const newVertexPosition: Vector3Tuple = [2, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).not.toBeNull();

    // Segment 0 should have 2 points: [0,0,0] and [2,0,0]
    expect(result!.filter((t) => t.segmentIndex === 0).length).toBe(1); // Only new vertex

    // Segment 1 should have 3 points: [2,0,0], [5,0,0], [10,0,0]
    const segment1Transforms = result!.filter((t) => t.segmentIndex === 1);
    expect(segment1Transforms.length).toBe(3);
  });

  it("handles splitting middle segment in multi-segment polyline", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      [
        [10, 0, 0],
        [20, 0, 0],
      ],
      [
        [20, 0, 0],
        [30, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    const newVertexPosition: Vector3Tuple = [15, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      1,
      newVertexPosition
    );

    expect(result).not.toBeNull();

    // Segment 0 should remain unchanged (no transforms)
    expect(result!.filter((t) => t.segmentIndex === 0).length).toBe(0);

    // Segment 1 should have new vertex at point 1
    expect(
      result!.find((t) => t.segmentIndex === 1 && t.pointIndex === 1)?.position
    ).toEqual([15, 0, 0]);

    // Segment 2 should have new vertex at point 0 and original end point at point 1
    expect(
      result!.find((t) => t.segmentIndex === 2 && t.pointIndex === 0)?.position
    ).toEqual([15, 0, 0]);
    expect(
      result!.find((t) => t.segmentIndex === 2 && t.pointIndex === 1)?.position
    ).toEqual([20, 0, 0]);

    // Original segment 2 is now at index 3, but since it had no transforms,
    // it still won't have any (it uses original points)
    // Verify the total transform count: segment 1 (1 transform) + segment 2 (2 transforms) = 3
    expect(result!.length).toBe(3);
  });

  it("returns null when new vertex is too close to existing vertex (at start)", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    // New vertex is exactly at the start point
    const newVertexPosition: Vector3Tuple = [0, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).toBeNull();
  });

  it("returns null when new vertex is too close to existing vertex (at end)", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    // New vertex is exactly at the end point
    const newVertexPosition: Vector3Tuple = [10, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).toBeNull();
  });

  it("returns null when new vertex is within epsilon tolerance of existing vertex", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    // New vertex is very close to start point (within epsilon)
    const newVertexPosition: Vector3Tuple = [0.0000001, 0.0000001, 0.0000001];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).toBeNull();
  });

  it("inserts vertex when new position is outside epsilon tolerance", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    // New vertex is outside epsilon tolerance (default is 1e-6)
    const newVertexPosition: Vector3Tuple = [0.001, 0, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns null when new vertex is close to any vertex in multi-point segment", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
      ],
    ];
    const currentTransforms: PolylinePointTransform[] = [];
    // New vertex is very close to the middle point
    const newVertexPosition: Vector3Tuple = [5, 0.0000001, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).toBeNull();
  });

  it("returns null when new vertex is close to a transformed vertex", () => {
    const originalPoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    // The end point has been transformed to [12, 2, 0]
    const currentTransforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 1, position: [12, 2, 0] },
    ];
    // New vertex is very close to the transformed position
    const newVertexPosition: Vector3Tuple = [12, 2.0000001, 0];

    const result = insertVertexInSegment(
      originalPoints,
      currentTransforms,
      0,
      newVertexPosition
    );

    expect(result).toBeNull();
  });
});

describe("findClickedSegment", () => {
  it("finds segment when click is close to it", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const clickPosition: Vector3Tuple = [5, 0.05, 0];

    const result = findClickedSegment(effectivePoints, clickPosition, 0.1);

    expect(result).not.toBeNull();
    expect(result?.segmentIndex).toBe(0);
    expect(result?.newVertexPosition[0]).toBeCloseTo(5);
    expect(result?.newVertexPosition[1]).toBeCloseTo(0);
  });

  it("returns null when click is too far from any segment", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const clickPosition: Vector3Tuple = [5, 10, 0];

    const result = findClickedSegment(effectivePoints, clickPosition, 0.1);

    expect(result).toBeNull();
  });

  it("finds closest segment in multi-segment polyline", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
      [
        [10, 0, 0],
        [20, 10, 0],
      ],
      [
        [20, 10, 0],
        [30, 10, 0],
      ],
    ];
    const clickPosition: Vector3Tuple = [25, 10.05, 0];

    const result = findClickedSegment(effectivePoints, clickPosition, 0.2);

    expect(result).not.toBeNull();
    expect(result?.segmentIndex).toBe(2);
  });

  it("respects custom maxDistance parameter", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [10, 0, 0],
      ],
    ];
    const clickPosition: Vector3Tuple = [5, 0.5, 0];

    // With default tolerance (0.1), should not find
    const result1 = findClickedSegment(effectivePoints, clickPosition, 0.1);
    expect(result1).toBeNull();

    // With larger tolerance (1.0), should find
    const result2 = findClickedSegment(effectivePoints, clickPosition, 1.0);
    expect(result2).not.toBeNull();
    expect(result2?.segmentIndex).toBe(0);
  });

  it("handles segments with multiple points", () => {
    const effectivePoints: Vector3Tuple[][] = [
      [
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
      ],
    ];
    const clickPosition: Vector3Tuple = [7, 0.05, 0];

    const result = findClickedSegment(effectivePoints, clickPosition, 0.2);

    expect(result).not.toBeNull();
    expect(result?.segmentIndex).toBe(0);
    // Click is between [5,0,0] and [10,0,0]
    expect(result?.newVertexPosition[0]).toBeCloseTo(7);
  });

  it("returns null for empty segments", () => {
    const effectivePoints: Vector3Tuple[][] = [];
    const clickPosition: Vector3Tuple = [5, 0, 0];

    const result = findClickedSegment(effectivePoints, clickPosition);

    expect(result).toBeNull();
  });

  it("handles segments with only one point", () => {
    const effectivePoints: Vector3Tuple[][] = [[[0, 0, 0]]];
    const clickPosition: Vector3Tuple = [0, 0, 0];

    const result = findClickedSegment(effectivePoints, clickPosition);

    // Single point segments should be skipped
    expect(result).toBeNull();
  });
});
