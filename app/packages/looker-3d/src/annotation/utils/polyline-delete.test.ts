import { describe, expect, it } from "vitest";
import type { PolylinePointTransform } from "../types";
import { deletePolylinePoint } from "./polyline-delete";

describe("deletePolylinePoint", () => {
  it("should return unchanged transforms when point doesn't exist", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: [1, 1, 1] },
    ];

    const result = deletePolylinePoint(transforms, 1, 0);

    expect(result.newTransforms).toEqual(transforms);
    expect(result.deletedSegmentIndices).toEqual([]);
    expect(result.mergedSegmentIndex).toBeUndefined();
  });

  it("should delete entire segment when point is only in one segment", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: [1, 1, 1] },
      { segmentIndex: 1, pointIndex: 0, position: [2, 2, 2] },
      { segmentIndex: 1, pointIndex: 1, position: [3, 3, 3] },
    ];

    const result = deletePolylinePoint(transforms, 0, 0);

    expect(result.newTransforms).toEqual([
      { segmentIndex: 1, pointIndex: 0, position: [2, 2, 2] },
      { segmentIndex: 1, pointIndex: 1, position: [3, 3, 3] },
    ]);
    expect(result.deletedSegmentIndices).toEqual([0]);
    expect(result.mergedSegmentIndex).toBeUndefined();
  });

  it("should merge segments when point is shared between two segments", () => {
    const sharedPoint: [number, number, number] = [1, 1, 1];
    const transforms: PolylinePointTransform[] = [
      // Segment 0: [0,0,0] -> [1,1,1]
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: sharedPoint },
      // Segment 1: [1,1,1] -> [2,2,2]
      { segmentIndex: 1, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 1, pointIndex: 1, position: [2, 2, 2] },
    ];

    const result = deletePolylinePoint(transforms, 0, 1);

    expect(result.newTransforms).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: [2, 2, 2] },
    ]);
    expect(result.deletedSegmentIndices).toEqual([0, 1]);
    expect(result.mergedSegmentIndex).toBe(0);
  });

  it("should merge segments with different segment indices", () => {
    const sharedPoint: [number, number, number] = [1, 1, 1];
    const transforms: PolylinePointTransform[] = [
      // Segment 2: [0,0,0] -> [1,1,1]
      { segmentIndex: 2, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 2, pointIndex: 1, position: sharedPoint },
      // Segment 5: [1,1,1] -> [2,2,2]
      { segmentIndex: 5, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 5, pointIndex: 1, position: [2, 2, 2] },
    ];

    const result = deletePolylinePoint(transforms, 2, 1);

    expect(result.newTransforms).toEqual([
      { segmentIndex: 2, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 2, pointIndex: 1, position: [2, 2, 2] },
    ]);
    expect(result.deletedSegmentIndices).toEqual([2, 5]);
    expect(result.mergedSegmentIndex).toBe(2);
  });

  it("should only remove point from selected segment when point is in more than 2 segments", () => {
    const sharedPoint: [number, number, number] = [1, 1, 1];
    const transforms: PolylinePointTransform[] = [
      // Segment 0: [0,0,0] -> [1,1,1]
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: sharedPoint },
      // Segment 1: [1,1,1] -> [2,2,2]
      { segmentIndex: 1, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 1, pointIndex: 1, position: [2, 2, 2] },
      // Segment 2: [1,1,1] -> [3,3,3]
      { segmentIndex: 2, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 2, pointIndex: 1, position: [3, 3, 3] },
    ];

    const result = deletePolylinePoint(transforms, 0, 1);

    expect(result.newTransforms).toEqual([
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 1, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 1, pointIndex: 1, position: [2, 2, 2] },
      { segmentIndex: 2, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 2, pointIndex: 1, position: [3, 3, 3] },
    ]);
    expect(result.deletedSegmentIndices).toEqual([]);
    expect(result.mergedSegmentIndex).toBeUndefined();
  });

  it("should handle edge case where segments cannot be merged due to missing other points", () => {
    const sharedPoint: [number, number, number] = [1, 1, 1];
    const transforms: PolylinePointTransform[] = [
      // Segment 0: only has the shared point (invalid segment)
      { segmentIndex: 0, pointIndex: 1, position: sharedPoint },
      // Segment 1: [1,1,1] -> [2,2,2]
      { segmentIndex: 1, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 1, pointIndex: 1, position: [2, 2, 2] },
    ];

    const result = deletePolylinePoint(transforms, 0, 1);

    // The function should detect that there are 2 segments sharing the point
    // and try to merge them, but since segment 0 only has one point,
    // it should fall back to just removing the point from the selected segment
    expect(result.newTransforms).toHaveLength(3);
    expect(result.deletedSegmentIndices).toEqual([]);
    expect(result.mergedSegmentIndex).toBeUndefined();

    // The result should still contain the shared point from segment 1
    expect(
      result.newTransforms.some(
        (t) =>
          t.segmentIndex === 1 &&
          t.pointIndex === 0 &&
          t.position[0] === 1 &&
          t.position[1] === 1 &&
          t.position[2] === 1
      )
    ).toBe(true);
  });

  it("should handle empty transforms array", () => {
    const result = deletePolylinePoint([], 0, 0);

    expect(result.newTransforms).toEqual([]);
    expect(result.deletedSegmentIndices).toEqual([]);
    expect(result.mergedSegmentIndex).toBeUndefined();
  });

  it("should handle single point segment deletion", () => {
    const transforms: PolylinePointTransform[] = [
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
    ];

    const result = deletePolylinePoint(transforms, 0, 0);

    expect(result.newTransforms).toEqual([]);
    expect(result.deletedSegmentIndices).toEqual([0]);
    expect(result.mergedSegmentIndex).toBeUndefined();
  });

  it("should preserve other segments when deleting one segment", () => {
    const transforms: PolylinePointTransform[] = [
      // Segment 0: [0,0,0] -> [1,1,1]
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: [1, 1, 1] },
      // Segment 1: [2,2,2] -> [3,3,3]
      { segmentIndex: 1, pointIndex: 0, position: [2, 2, 2] },
      { segmentIndex: 1, pointIndex: 1, position: [3, 3, 3] },
    ];

    const result = deletePolylinePoint(transforms, 0, 0);

    expect(result.newTransforms).toEqual([
      { segmentIndex: 1, pointIndex: 0, position: [2, 2, 2] },
      { segmentIndex: 1, pointIndex: 1, position: [3, 3, 3] },
    ]);
    expect(result.deletedSegmentIndices).toEqual([0]);
  });

  it("should handle complex merging scenario with multiple segments", () => {
    const sharedPoint: [number, number, number] = [1, 1, 1];
    const transforms: PolylinePointTransform[] = [
      // Segment 0: [0,0,0] -> [1,1,1]
      { segmentIndex: 0, pointIndex: 0, position: [0, 0, 0] },
      { segmentIndex: 0, pointIndex: 1, position: sharedPoint },
      // Segment 1: [1,1,1] -> [2,2,2]
      { segmentIndex: 1, pointIndex: 0, position: sharedPoint },
      { segmentIndex: 1, pointIndex: 1, position: [2, 2, 2] },
      // Segment 2: [3,3,3] -> [4,4,4] (unrelated)
      { segmentIndex: 2, pointIndex: 0, position: [3, 3, 3] },
      { segmentIndex: 2, pointIndex: 1, position: [4, 4, 4] },
    ];

    const result = deletePolylinePoint(transforms, 0, 1);

    // The result should contain the merged segment and the unrelated segment
    // The order might vary, so let's check the content more flexibly
    expect(result.newTransforms).toHaveLength(4);
    expect(result.deletedSegmentIndices).toEqual([0, 1]);
    expect(result.mergedSegmentIndex).toBe(0);

    // Check that we have the merged segment [0,0,0] -> [2,2,2]
    const mergedSegment = result.newTransforms.filter(
      (t) => t.segmentIndex === 0
    );
    expect(mergedSegment).toHaveLength(2);
    expect(
      mergedSegment.some(
        (t) =>
          t.pointIndex === 0 &&
          t.position[0] === 0 &&
          t.position[1] === 0 &&
          t.position[2] === 0
      )
    ).toBe(true);
    expect(
      mergedSegment.some(
        (t) =>
          t.pointIndex === 1 &&
          t.position[0] === 2 &&
          t.position[1] === 2 &&
          t.position[2] === 2
      )
    ).toBe(true);

    // Check that we have the unrelated segment [3,3,3] -> [4,4,4]
    const unrelatedSegment = result.newTransforms.filter(
      (t) => t.segmentIndex === 2
    );
    expect(unrelatedSegment).toHaveLength(2);
    expect(
      unrelatedSegment.some(
        (t) =>
          t.pointIndex === 0 &&
          t.position[0] === 3 &&
          t.position[1] === 3 &&
          t.position[2] === 3
      )
    ).toBe(true);
    expect(
      unrelatedSegment.some(
        (t) =>
          t.pointIndex === 1 &&
          t.position[0] === 4 &&
          t.position[1] === 4 &&
          t.position[2] === 4
      )
    ).toBe(true);
  });
});
