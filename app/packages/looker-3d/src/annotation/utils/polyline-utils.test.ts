import type { Vector3Tuple } from "three";
import { describe, expect, it } from "vitest";
import { SNAP_TOLERANCE } from "../../constants";
import type { PolylinePointTransform } from "../types";
import {
  applyDeltaToAllPoints,
  applyTransformsToPolyline,
  calculatePolylineCentroid,
  findSharedPointSegments,
  getCurrentVertexPosition,
  getVertexPosition,
  shouldClosePolylineLoop,
} from "./polyline-utils";

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

  it("handles floating point precision issues", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0.1, 0.2, 0.3] },
      { segmentIndex: 1, pointIndex: 0, position: [0.1, 0.2, 0.3] },
    ];
    const position: [number, number, number] = [0.1, 0.2, 0.3];

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
