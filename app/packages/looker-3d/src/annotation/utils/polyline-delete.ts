import type { PolylinePointTransform } from "../types";

export interface DeletePointResult {
  newTransforms: PolylinePointTransform[];
  deletedSegmentIndices: number[];
  mergedSegmentIndex?: number;
}

/**
 * Deletes a polyline point and handles segment merging logic.
 *
 * @param currentTransforms - Current polyline point transforms
 * @param segmentIndex - Index of the segment containing the point to delete
 * @param pointIndex - Index of the point within the segment to delete
 * @returns Object containing new transforms and metadata about the operation
 */
export function deletePolylinePoint(
  currentTransforms: PolylinePointTransform[],
  segmentIndex: number,
  pointIndex: number
): DeletePointResult {
  // Find the position of the point being deleted
  const pointToDelete = currentTransforms.find(
    (transform) =>
      transform.segmentIndex === segmentIndex &&
      transform.pointIndex === pointIndex
  );

  if (!pointToDelete) {
    // Point doesn't exist in transforms, nothing to delete
    return {
      newTransforms: currentTransforms,
      deletedSegmentIndices: [],
    };
  }

  const pointPosition = pointToDelete.position;

  // Find all segments that share this point position
  const segmentsWithThisPoint = currentTransforms.filter(
    (transform) =>
      transform.position[0] === pointPosition[0] &&
      transform.position[1] === pointPosition[1] &&
      transform.position[2] === pointPosition[2]
  );

  // Group by segment index
  const segmentsMap = new Map<number, PolylinePointTransform[]>();
  segmentsWithThisPoint.forEach((transform) => {
    if (!segmentsMap.has(transform.segmentIndex)) {
      segmentsMap.set(transform.segmentIndex, []);
    }
    segmentsMap.get(transform.segmentIndex)!.push(transform);
  });

  let newTransforms = [...currentTransforms];
  const deletedSegmentIndices: number[] = [];
  let mergedSegmentIndex: number | undefined;

  if (segmentsMap.size === 1) {
    // Point is only in one segment, delete the entire segment
    const segmentToDelete = segmentsMap.keys().next().value;
    deletedSegmentIndices.push(segmentToDelete);
    newTransforms = newTransforms.filter(
      (transform) => transform.segmentIndex !== segmentToDelete
    );
  } else if (segmentsMap.size === 2) {
    // Point is shared between two segments, merge them
    const segmentIndices = Array.from(segmentsMap.keys());
    const segment1 = segmentIndices[0];
    const segment2 = segmentIndices[1];

    // Get the other points from both segments
    const segment1Points = currentTransforms.filter(
      (transform) => transform.segmentIndex === segment1
    );
    const segment2Points = currentTransforms.filter(
      (transform) => transform.segmentIndex === segment2
    );

    // Find the non-shared points
    const segment1OtherPoint = segment1Points.find(
      (transform) =>
        transform.position[0] !== pointPosition[0] ||
        transform.position[1] !== pointPosition[1] ||
        transform.position[2] !== pointPosition[2]
    );
    const segment2OtherPoint = segment2Points.find(
      (transform) =>
        transform.position[0] !== pointPosition[0] ||
        transform.position[1] !== pointPosition[1] ||
        transform.position[2] !== pointPosition[2]
    );

    if (segment1OtherPoint && segment2OtherPoint) {
      // Remove both old segments
      deletedSegmentIndices.push(segment1, segment2);
      newTransforms = newTransforms.filter(
        (transform) =>
          transform.segmentIndex !== segment1 &&
          transform.segmentIndex !== segment2
      );

      // Create a new merged segment
      mergedSegmentIndex = Math.min(segment1, segment2);
      newTransforms.push({
        segmentIndex: mergedSegmentIndex,
        pointIndex: 0,
        position: segment1OtherPoint.position,
      });
      newTransforms.push({
        segmentIndex: mergedSegmentIndex,
        pointIndex: 1,
        position: segment2OtherPoint.position,
      });
    }
  } else {
    // Point is in more than 2 segments, just remove the point from the selected segment
    newTransforms = newTransforms.filter(
      (transform) =>
        !(
          transform.segmentIndex === segmentIndex &&
          transform.pointIndex === pointIndex
        )
    );
  }

  return {
    newTransforms,
    deletedSegmentIndices,
    mergedSegmentIndex,
  };
}
