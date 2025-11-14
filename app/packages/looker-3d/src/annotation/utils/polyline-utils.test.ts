import { describe, expect, it } from "vitest";
import type { Vector3Tuple } from "three";
import type { PolylineSegmentTransform, SelectedPoint } from "../types";
import {
  applyDeltaToAllPoints,
  applyTransformsToPolyline,
  findClickedSegment,
  getVertexPosition,
  insertVertexInSegment,
  shouldClosePolylineLoop,
  updateVertexPosition,
} from "./polyline-utils";

describe("polyline-utils", () => {
  describe("applyTransformsToPolyline", () => {
    it("should return original points when no transforms exist", () => {
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [];

      const result = applyTransformsToPolyline(originalPoints, segments);

      expect(result).toEqual(originalPoints);
    });

    it("should apply transforms when they exist", () => {
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [
        {
          points: [
            [0.5, 0.5, 0.5],
            [1.5, 0.5, 0.5],
          ],
        },
      ];

      const result = applyTransformsToPolyline(originalPoints, segments);

      expect(result).toEqual([
        [
          [0.5, 0.5, 0.5],
          [1.5, 0.5, 0.5],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
      ]);
    });

    it("should handle partial transforms", () => {
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
        [
          [4, 0, 0],
          [5, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [
        {
          points: [
            [0.5, 0.5, 0.5],
            [1.5, 0.5, 0.5],
          ],
        },
        {
          points: [],
        },
      ];

      const result = applyTransformsToPolyline(originalPoints, segments);

      expect(result).toEqual([
        [
          [0.5, 0.5, 0.5],
          [1.5, 0.5, 0.5],
        ],
        [],
        [
          [4, 0, 0],
          [5, 0, 0],
        ],
      ]);
    });

    it("should handle more transforms than original segments", () => {
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [
        {
          points: [
            [0.5, 0.5, 0.5],
            [1.5, 0.5, 0.5],
          ],
        },
        {
          points: [
            [2, 2, 2],
            [3, 3, 3],
          ],
        },
      ];

      const result = applyTransformsToPolyline(originalPoints, segments);

      expect(result).toEqual([
        [
          [0.5, 0.5, 0.5],
          [1.5, 0.5, 0.5],
        ],
        [
          [2, 2, 2],
          [3, 3, 3],
        ],
      ]);
    });
  });

  describe("applyDeltaToAllPoints", () => {
    it("should apply delta to all points in all segments", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [1, 1, 0],
        ],
        [
          [2, 0, 0],
          [3, 0, 0],
        ],
      ];
      const delta: [number, number, number] = [1, 2, 3];

      const result = applyDeltaToAllPoints(effectivePoints, delta);

      expect(result).toEqual([
        {
          points: [
            [1, 2, 3],
            [2, 2, 3],
            [2, 3, 3],
          ],
        },
        {
          points: [
            [3, 2, 3],
            [4, 2, 3],
          ],
        },
      ]);
    });

    it("should handle negative deltas", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [5, 5, 5],
          [6, 6, 6],
        ],
      ];
      const delta: [number, number, number] = [-1, -2, -3];

      const result = applyDeltaToAllPoints(effectivePoints, delta);

      expect(result).toEqual([
        {
          points: [
            [4, 3, 2],
            [5, 4, 3],
          ],
        },
      ]);
    });

    it("should handle empty segments", () => {
      const effectivePoints: Vector3Tuple[][] = [];
      const delta: [number, number, number] = [1, 2, 3];

      const result = applyDeltaToAllPoints(effectivePoints, delta);

      expect(result).toEqual([]);
    });
  });

  describe("findClickedSegment", () => {
    it("should find the closest segment when click is near a line", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        [
          [0, 5, 0],
          [10, 5, 0],
        ],
      ];
      const clickPosition: Vector3Tuple = [5, 0.1, 0];
      const distanceThreshold = 1;

      const result = findClickedSegment(
        effectivePoints,
        clickPosition,
        distanceThreshold
      );

      expect(result).not.toBeNull();
      expect(result?.segmentIndex).toBe(0);
      expect(result?.newVertexPosition[0]).toBeCloseTo(5);
      expect(result?.newVertexPosition[1]).toBeCloseTo(0);
      expect(result?.newVertexPosition[2]).toBeCloseTo(0);
    });

    it("should return null when click is too far from any segment", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ];
      const clickPosition: Vector3Tuple = [5, 10, 0];
      const distanceThreshold = 1;

      const result = findClickedSegment(
        effectivePoints,
        clickPosition,
        distanceThreshold
      );

      expect(result).toBeNull();
    });

    it("should find the closest segment when multiple segments are nearby", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        [
          [0, 1, 0],
          [10, 1, 0],
        ],
      ];
      const clickPosition: Vector3Tuple = [5, 0.2, 0];
      const distanceThreshold = 1;

      const result = findClickedSegment(
        effectivePoints,
        clickPosition,
        distanceThreshold
      );

      expect(result).not.toBeNull();
      expect(result?.segmentIndex).toBe(0); // Closer to segment 0
    });

    it("should project click position onto the line segment", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
        ],
      ];
      const clickPosition: Vector3Tuple = [5, 2, 0];
      const distanceThreshold = 5;

      const result = findClickedSegment(
        effectivePoints,
        clickPosition,
        distanceThreshold
      );

      expect(result).not.toBeNull();
      expect(result?.newVertexPosition[0]).toBeCloseTo(5);
      expect(result?.newVertexPosition[1]).toBeCloseTo(0);
    });

    it("should handle clicking near endpoints", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ];
      const clickPosition: Vector3Tuple = [0.1, 0.1, 0];
      const distanceThreshold = 1;

      const result = findClickedSegment(
        effectivePoints,
        clickPosition,
        distanceThreshold
      );

      expect(result).not.toBeNull();
      expect(result?.newVertexPosition[0]).toBeCloseTo(0.1);
      expect(result?.newVertexPosition[1]).toBeCloseTo(0);
    });
  });

  describe("insertVertexInSegment", () => {
    it("should insert a vertex between two existing vertices", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const newVertexPosition: Vector3Tuple = [5, 0, 0];
      const clickPosition: Vector3Tuple = [5, 0.1, 0];

      const result = insertVertexInSegment(
        effectivePoints,
        currentSegments,
        segmentIndex,
        newVertexPosition,
        clickPosition
      );

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].points).toEqual([
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0],
      ]);
    });

    it("should return null when vertex is too close to an existing vertex", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const newVertexPosition: Vector3Tuple = [0.01, 0, 0]; // Very close to [0,0,0]
      const clickPosition: Vector3Tuple = [0.01, 0, 0];

      const result = insertVertexInSegment(
        effectivePoints,
        currentSegments,
        segmentIndex,
        newVertexPosition,
        clickPosition
      );

      expect(result).toBeNull();
    });

    it("should insert into the correct segment when multiple segments exist", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
        [
          [0, 5, 0],
          [10, 5, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 1;
      const newVertexPosition: Vector3Tuple = [5, 5, 0];
      const clickPosition: Vector3Tuple = [5, 5, 0];

      const result = insertVertexInSegment(
        effectivePoints,
        currentSegments,
        segmentIndex,
        newVertexPosition,
        clickPosition
      );

      expect(result).not.toBeNull();
      expect(result).toHaveLength(2);
      expect(result![0].points).toEqual([]);
      expect(result![1].points).toEqual([
        [0, 5, 0],
        [5, 5, 0],
        [10, 5, 0],
      ]);
    });

    it("should insert vertex into multi-point segment at correct position", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [5, 0, 0],
          [10, 0, 0],
          [15, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const newVertexPosition: Vector3Tuple = [7.5, 0, 0];
      const clickPosition: Vector3Tuple = [7.5, 0.1, 0];

      const result = insertVertexInSegment(
        effectivePoints,
        currentSegments,
        segmentIndex,
        newVertexPosition,
        clickPosition
      );

      expect(result).not.toBeNull();
      expect(result![0].points).toEqual([
        [0, 0, 0],
        [5, 0, 0],
        [7.5, 0, 0],
        [10, 0, 0],
        [15, 0, 0],
      ]);
    });

    it("should return null for invalid segment index", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [10, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 5; // Invalid
      const newVertexPosition: Vector3Tuple = [5, 0, 0];
      const clickPosition: Vector3Tuple = [5, 0, 0];

      const result = insertVertexInSegment(
        effectivePoints,
        currentSegments,
        segmentIndex,
        newVertexPosition,
        clickPosition
      );

      expect(result).toBeNull();
    });
  });

  describe("shouldClosePolylineLoop", () => {
    it("should return true when current position is close to first vertex", () => {
      const vertices: Vector3Tuple[] = [
        [0, 0, 0],
        [5, 0, 0],
        [5, 5, 0],
      ];
      const currentPosition: Vector3Tuple = [0.1, 0.1, 0];
      const tolerance = 0.5;

      const result = shouldClosePolylineLoop(
        vertices,
        currentPosition,
        tolerance
      );

      expect(result).toBe(true);
    });

    it("should return false when current position is far from first vertex", () => {
      const vertices: Vector3Tuple[] = [
        [0, 0, 0],
        [5, 0, 0],
        [5, 5, 0],
      ];
      const currentPosition: Vector3Tuple = [10, 10, 0];
      const tolerance = 0.5;

      const result = shouldClosePolylineLoop(
        vertices,
        currentPosition,
        tolerance
      );

      expect(result).toBe(false);
    });

    it("should return false when there are less than 3 vertices", () => {
      const vertices: Vector3Tuple[] = [
        [0, 0, 0],
        [5, 0, 0],
      ];
      const currentPosition: Vector3Tuple = [0, 0, 0];
      const tolerance = 0.5;

      const result = shouldClosePolylineLoop(
        vertices,
        currentPosition,
        tolerance
      );

      expect(result).toBe(false);
    });

    it("should work with 3D positions", () => {
      const vertices: Vector3Tuple[] = [
        [0, 0, 0],
        [5, 5, 5],
        [10, 10, 10],
      ];
      const currentPosition: Vector3Tuple = [0.1, 0.1, 0.1];
      const tolerance = 0.2;

      const result = shouldClosePolylineLoop(
        vertices,
        currentPosition,
        tolerance
      );

      expect(result).toBe(true);
    });

    it("should respect tolerance parameter", () => {
      const vertices: Vector3Tuple[] = [
        [0, 0, 0],
        [5, 0, 0],
        [5, 5, 0],
      ];
      const currentPosition: Vector3Tuple = [0.3, 0, 0];

      // With tolerance 0.2, should not close
      expect(shouldClosePolylineLoop(vertices, currentPosition, 0.2)).toBe(
        false
      );

      // With tolerance 0.5, should close
      expect(shouldClosePolylineLoop(vertices, currentPosition, 0.5)).toBe(
        true
      );
    });
  });

  describe("getVertexPosition", () => {
    it("should return transformed position when transform exists", () => {
      const selectedPoint: SelectedPoint = {
        labelId: "label1",
        segmentIndex: 0,
        pointIndex: 1,
      };
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [
        {
          points: [
            [0, 0, 0],
            [1.5, 0.5, 0.5],
            [2, 0, 0],
          ],
        },
      ];

      const result = getVertexPosition(selectedPoint, originalPoints, segments);

      expect(result).toEqual([1.5, 0.5, 0.5]);
    });

    it("should return original position when no transform exists", () => {
      const selectedPoint: SelectedPoint = {
        labelId: "label1",
        segmentIndex: 0,
        pointIndex: 1,
      };
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [];

      const result = getVertexPosition(selectedPoint, originalPoints, segments);

      expect(result).toEqual([1, 0, 0]);
    });

    it("should return null when point is not found", () => {
      const selectedPoint: SelectedPoint = {
        labelId: "label1",
        segmentIndex: 5,
        pointIndex: 10,
      };
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [];

      const result = getVertexPosition(selectedPoint, originalPoints, segments);

      expect(result).toBeNull();
    });

    it("should handle multiple segments correctly", () => {
      const selectedPoint: SelectedPoint = {
        labelId: "label1",
        segmentIndex: 1,
        pointIndex: 0,
      };
      const originalPoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [5, 5, 5],
          [6, 6, 6],
        ],
      ];
      const segments: PolylineSegmentTransform[] = [
        {
          points: [
            [0.5, 0.5, 0.5],
            [1.5, 0.5, 0.5],
          ],
        },
      ];

      const result = getVertexPosition(selectedPoint, originalPoints, segments);

      // Segment 1 has no transform, so should return original
      expect(result).toEqual([5, 5, 5]);
    });
  });

  describe("updateVertexPosition", () => {
    it("should update a single vertex position", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const pointIndex = 1;
      const newPosition: Vector3Tuple = [1.5, 0.5, 0.5];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        false // Don't update shared vertices
      );

      expect(result).toHaveLength(1);
      expect(result[0].points[1]).toEqual([1.5, 0.5, 0.5]);
    });

    it("should update all shared vertices when updateShared is true", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
        [
          [2, 0, 0], // Same position as segment 0, point 2
          [3, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const pointIndex = 2;
      const newPosition: Vector3Tuple = [2.5, 0.5, 0.5];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        true // Update shared vertices
      );

      expect(result).toHaveLength(2);
      expect(result[0].points[2]).toEqual([2.5, 0.5, 0.5]);
      expect(result[1].points[0]).toEqual([2.5, 0.5, 0.5]); // Also updated
    });

    it("should not update shared vertices when updateShared is false", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
        [
          [2, 0, 0], // Same position as segment 0, point 2
          [3, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const pointIndex = 2;
      const newPosition: Vector3Tuple = [2.5, 0.5, 0.5];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        false // Don't update shared vertices
      );

      expect(result).toHaveLength(1);
      expect(result[0].points[2]).toEqual([2.5, 0.5, 0.5]);
      // Segment 1 should not exist or have original points
    });

    it("should return unchanged segments for invalid indices", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 5; // Invalid
      const pointIndex = 10; // Invalid
      const newPosition: Vector3Tuple = [1.5, 0.5, 0.5];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        false
      );

      expect(result).toEqual(currentSegments);
    });

    it("should handle existing transforms correctly", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [5, 5, 5],
          [6, 6, 6],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [
        {
          points: [
            [0.5, 0.5, 0.5],
            [1.5, 0.5, 0.5],
          ],
        },
      ];
      const segmentIndex = 0;
      const pointIndex = 1;
      const newPosition: Vector3Tuple = [2, 1, 1];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        false
      );

      expect(result).toHaveLength(1);
      expect(result[0].points).toEqual([
        [0.5, 0.5, 0.5],
        [2, 1, 1],
      ]);
    });

    it("should detect shared vertices with small tolerance", () => {
      const effectivePoints: Vector3Tuple[][] = [
        [
          [0, 0, 0],
          [1, 0, 0],
        ],
        [
          [1.00005, 0.00005, 0.00005], // Very close to [1,0,0]
          [2, 0, 0],
        ],
      ];
      const currentSegments: PolylineSegmentTransform[] = [];
      const segmentIndex = 0;
      const pointIndex = 1;
      const newPosition: Vector3Tuple = [1.5, 0.5, 0.5];

      const result = updateVertexPosition(
        effectivePoints,
        currentSegments,
        segmentIndex,
        pointIndex,
        newPosition,
        true
      );

      expect(result).toHaveLength(2);
      expect(result[0].points[1]).toEqual([1.5, 0.5, 0.5]);
      expect(result[1].points[0]).toEqual([1.5, 0.5, 0.5]);
    });
  });
});
