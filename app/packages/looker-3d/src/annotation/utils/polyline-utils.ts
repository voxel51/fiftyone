import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { SNAP_TOLERANCE } from "../../constants";
import type { PolylinePointTransform } from "../types";

// Epsilon tolerance for floating-point position comparisons
const EPS = 1e-6;

/**
 * Compares two 3D positions using epsilon tolerance for floating-point precision.
 *
 * @param p1 - First position
 * @param p2 - Second position
 * @param epsilon - Tolerance for comparison (default: EPS)
 * @returns True if positions are equal within tolerance
 */
function positionsEqual(
  p1: [number, number, number],
  p2: [number, number, number],
  epsilon: number = EPS
): boolean {
  return (
    Math.abs(p1[0] - p2[0]) <= epsilon &&
    Math.abs(p1[1] - p2[1]) <= epsilon &&
    Math.abs(p1[2] - p2[2]) <= epsilon
  );
}

/**
 * Gets the current position of a vertex, considering any applied transforms.
 *
 * @param selectedPoint - The point to look up with segmentIndex, pointIndex, and labelId
 * @param polylinePoints3d - Original polyline points array
 * @param transforms - Array of applied transforms
 * @returns The current position of the vertex or null if not found
 */
export function getVertexPosition(
  selectedPoint: { segmentIndex: number; pointIndex: number; labelId: string },
  polylinePoints3d: Vector3Tuple[][],
  transforms: PolylinePointTransform[]
): [number, number, number] | null {
  if (!selectedPoint || !polylinePoints3d) return null;

  const { segmentIndex, pointIndex } = selectedPoint;

  // Check if segment exists
  if (segmentIndex >= polylinePoints3d.length) return null;

  // Check if point exists in segment
  if (pointIndex >= polylinePoints3d[segmentIndex].length) return null;

  // Look for existing transform
  const transform = transforms.find(
    (t) => t.segmentIndex === segmentIndex && t.pointIndex === pointIndex
  );

  // Return transformed position if exists, otherwise return original position
  if (transform) {
    return transform.position;
  }

  return polylinePoints3d[segmentIndex][pointIndex];
}

/**
 * Calculates the centroid (center of mass) of a polyline from its points.
 *
 * @param points3d - Array of polyline segments, each containing 3D points
 * @returns The centroid as [x, y, z] coordinates
 */
export function calculatePolylineCentroid(
  points3d: Vector3Tuple[][]
): [number, number, number] {
  if (!points3d || points3d.length === 0) return [0, 0, 0];

  // Flatten all points from all segments
  const allPoints = points3d.flat();

  if (allPoints.length === 0) return [0, 0, 0];

  // Calculate sum of all coordinates
  const sum = allPoints.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
    [0, 0, 0]
  );

  // Return average coordinates
  return [
    sum[0] / allPoints.length,
    sum[1] / allPoints.length,
    sum[2] / allPoints.length,
  ];
}

/**
 * Finds all segments that share a specific point position.
 *
 * @param transforms - Array of point transforms
 * @param position - The position to search for
 * @returns Array of segment indices that contain this position
 */
export function findSharedPointSegments(
  transforms: PolylinePointTransform[],
  position: [number, number, number]
): number[] {
  const segmentsWithThisPoint = transforms.filter((transform) =>
    positionsEqual(transform.position, position)
  );

  // Get unique segment indices
  const segmentIndices = new Set(
    segmentsWithThisPoint.map((transform) => transform.segmentIndex)
  );

  return Array.from(segmentIndices);
}

/**
 * Determines if a polyline should be closed based on proximity to the first vertex.
 *
 * @param vertices - Array of current vertices in the polyline
 * @param currentPosition - The current mouse/cursor position
 * @param snapTolerance - Distance threshold for snapping (default: SNAP_TOLERANCE)
 * @returns True if the current position is close enough to the first vertex to close the loop
 */
export function shouldClosePolylineLoop(
  vertices: Vector3Tuple[],
  currentPosition: Vector3Tuple,
  snapTolerance: number = SNAP_TOLERANCE
): boolean {
  if (vertices.length < 3) return false;

  const firstVertex = new THREE.Vector3(...vertices[0]);
  const currentPos = new THREE.Vector3(...currentPosition);

  return currentPos.distanceTo(firstVertex) < snapTolerance;
}

/**
 * Gets the current effective position of a vertex, considering transforms.
 *
 * @param segmentIndex - Index of the segment
 * @param pointIndex - Index of the point within the segment
 * @param originalPoints - Original polyline points
 * @param transforms - Applied transforms
 * @returns The current effective position of the vertex
 */
export function getCurrentVertexPosition(
  segmentIndex: number,
  pointIndex: number,
  originalPoints: Vector3Tuple[][],
  transforms: PolylinePointTransform[]
): [number, number, number] {
  // Look for existing transform
  const transform = transforms.find(
    (t) => t.segmentIndex === segmentIndex && t.pointIndex === pointIndex
  );

  if (transform) {
    return transform.position;
  }

  // Fall back to original position
  if (
    segmentIndex < originalPoints.length &&
    pointIndex < originalPoints[segmentIndex].length
  ) {
    return originalPoints[segmentIndex][pointIndex];
  }

  // Return default position for invalid indices
  return [0, 0, 0];
}

/**
 * Applies transforms to polyline points, returning the effective points.
 *
 * @param originalPoints - Original polyline points array
 * @param transforms - Array of transforms to apply
 * @returns Array of effective points after applying transforms
 */
export function applyTransformsToPolyline(
  originalPoints: Vector3Tuple[][],
  transforms: PolylinePointTransform[]
): Vector3Tuple[][] {
  // Start with a copy of original points
  const result = originalPoints.map((segment) => [...segment]);

  // Apply each transform
  transforms.forEach((transform) => {
    const { segmentIndex, pointIndex, position } = transform;

    // Ensure segment exists
    if (result[segmentIndex] === undefined) {
      result[segmentIndex] = [
        [0, 0, 0],
        [0, 0, 0],
      ];
    }

    // Apply transform if point exists
    if (pointIndex < result[segmentIndex].length) {
      result[segmentIndex][pointIndex] = position;
    }
  });

  return result;
}

/**
 * Applies a delta transformation to all points in a polyline.
 *
 * @param effectivePoints - Current effective points
 * @param originalPoints - Original polyline points
 * @param currentTransforms - Existing transforms
 * @param delta - The delta to apply to all points
 * @returns New transforms array with delta applied to all points
 */
export function applyDeltaToAllPoints(
  effectivePoints: Vector3Tuple[][],
  originalPoints: Vector3Tuple[][],
  currentTransforms: PolylinePointTransform[],
  delta: Vector3Tuple
): PolylinePointTransform[] {
  const newTransforms: PolylinePointTransform[] = [];

  // Helper to get current effective point for (segmentIndex, pointIndex)
  const getCurrent = (
    segmentIndex: number,
    pointIndex: number
  ): [number, number, number] => {
    const t = currentTransforms.find(
      (x) => x.segmentIndex === segmentIndex && x.pointIndex === pointIndex
    );
    return (t?.position ?? originalPoints[segmentIndex][pointIndex]) as [
      number,
      number,
      number
    ];
  };

  // Apply delta to all points
  effectivePoints.forEach((segment, segmentIndex) => {
    segment.forEach((_, pointIndex) => {
      const base = getCurrent(segmentIndex, pointIndex);
      const p = new THREE.Vector3(...base).add(new THREE.Vector3(...delta));
      newTransforms.push({
        segmentIndex,
        pointIndex,
        position: [p.x, p.y, p.z],
      });
    });
  });

  return newTransforms;
}

/**
 * Updates all duplicate vertices across segments when a vertex is moved.
 * This prevents tearing by ensuring all segments sharing a vertex move together.
 *
 * @param movedPoint - The original point that was moved
 * @param newPosition - The new position to apply to all duplicates
 * @param effectivePoints3d - Current effective points array
 * @param currentTransforms - Existing transforms
 * @returns Updated transforms array with new position applied to all duplicate vertices
 */
export function updateDuplicateVertices(
  movedPoint: Vector3Tuple,
  newPosition: Vector3Tuple,
  effectivePoints3d: Vector3Tuple[][],
  currentTransforms: PolylinePointTransform[]
): PolylinePointTransform[] {
  // Find all occurrences of this vertex across all segments
  const duplicates: { segmentIndex: number; pointIndex: number }[] = [];

  effectivePoints3d.forEach((segmentPoints, segIdx) => {
    segmentPoints.forEach((candidatePoint, ptIdx) => {
      if (positionsEqual(candidatePoint, movedPoint)) {
        duplicates.push({
          segmentIndex: segIdx,
          pointIndex: ptIdx,
        });
      }
    });
  });

  let newTransforms = [...currentTransforms];

  // Apply the new position to all duplicate vertices
  duplicates.forEach(({ segmentIndex: dupSeg, pointIndex: dupPt }) => {
    // Check if this vertex already has a transform
    const existingTransformIndex = newTransforms.findIndex(
      (transform) =>
        transform.segmentIndex === dupSeg && transform.pointIndex === dupPt
    );

    // Create the new transform with the updated position
    const newTransform = {
      segmentIndex: dupSeg,
      pointIndex: dupPt,
      position: newPosition,
    };

    // Update existing transform or add new one
    if (existingTransformIndex >= 0) {
      newTransforms[existingTransformIndex] = newTransform;
    } else {
      newTransforms.push(newTransform);
    }
  });

  return newTransforms;
}

/**
 * Finds the closest point on a line segment to a given click position.
 *
 * @param segmentStart - Start point of the segment
 * @param segmentEnd - End point of the segment
 * @param clickPosition - The position where the user clicked
 * @returns The closest point on the segment and the parametric t value (0 to 1)
 */
export function findClosestPointOnSegment(
  segmentStart: Vector3Tuple,
  segmentEnd: Vector3Tuple,
  clickPosition: Vector3Tuple
): { closestPoint: Vector3Tuple; t: number } {
  const start = new THREE.Vector3(...segmentStart);
  const end = new THREE.Vector3(...segmentEnd);
  const click = new THREE.Vector3(...clickPosition);

  const segmentVector = new THREE.Vector3().subVectors(end, start);
  const segmentLength = segmentVector.length();

  // If segment has zero length, return the start point
  if (segmentLength < EPS) {
    return { closestPoint: segmentStart, t: 0 };
  }

  const clickVector = new THREE.Vector3().subVectors(click, start);

  // Project click onto segment vector
  const t = clickVector.dot(segmentVector) / (segmentLength * segmentLength);

  // Clamp t to [0, 1] to stay on the segment
  const clampedT = Math.max(0, Math.min(1, t));

  const closestPoint = new THREE.Vector3()
    .copy(start)
    .add(segmentVector.multiplyScalar(clampedT));

  return {
    closestPoint: [closestPoint.x, closestPoint.y, closestPoint.z],
    t: clampedT,
  };
}

/**
 * Inserts a new vertex into a polyline segment, splitting it into two segments.
 * All subsequent segments have their indices incremented.
 *
 * @param originalPoints - Original polyline points array
 * @param currentTransforms - Current transforms applied to the polyline
 * @param targetSegmentIndex - Index of the segment to split
 * @param newVertexPosition - Position of the new vertex to insert
 * @returns New transforms array with the inserted vertex and renumbered segments, or null if the new vertex is too close to existing vertices
 */
export function insertVertexInSegment(
  originalPoints: Vector3Tuple[][],
  currentTransforms: PolylinePointTransform[],
  targetSegmentIndex: number,
  newVertexPosition: Vector3Tuple
): PolylinePointTransform[] | null {
  // Validate segment index
  if (targetSegmentIndex < 0 || targetSegmentIndex >= originalPoints.length) {
    throw new Error(`Invalid segment index: ${targetSegmentIndex}`);
  }

  const targetSegment = originalPoints[targetSegmentIndex];
  if (targetSegment.length < 2) {
    throw new Error(
      `Segment ${targetSegmentIndex} must have at least 2 points`
    );
  }

  // Get effective points for the target segment
  const effectiveSegment = targetSegment.map((point, pointIndex) => {
    const transform = currentTransforms.find(
      (t) =>
        t.segmentIndex === targetSegmentIndex && t.pointIndex === pointIndex
    );
    return transform ? transform.position : point;
  });

  // Check if the new vertex is too close to any existing vertex in the segment
  // If so, we should not insert it to avoid redundant vertices
  for (const existingVertex of effectiveSegment) {
    if (positionsEqual(newVertexPosition, existingVertex)) {
      // New vertex is too close to an existing vertex, skip insertion
      return null;
    }
  }

  // Step 1: Increment all segment indices >= targetSegmentIndex + 1
  const transformsWithUpdatedIndices = currentTransforms.map((transform) => {
    if (transform.segmentIndex > targetSegmentIndex) {
      return {
        ...transform,
        segmentIndex: transform.segmentIndex + 1,
      };
    }
    return transform;
  });

  // Step 2: Split the target segment
  // Assume we are inserting a new vertex B between points A and C in segment N
  // Original segment N: A -> C becomes:
  // New segment N: A -> B (new vertex)
  // New segment N+1: B (new vertex) -> C

  // For segment N (keeping first point, adding new vertex as second point)
  const segmentNTransforms: PolylinePointTransform[] = [
    // Keep the first point of original segment as is (point 0)
    ...transformsWithUpdatedIndices.filter(
      (t) => t.segmentIndex === targetSegmentIndex && t.pointIndex === 0
    ),
    // Add new vertex as point 1 of segment N
    {
      segmentIndex: targetSegmentIndex,
      pointIndex: 1,
      position: newVertexPosition,
    },
  ];

  // For segment N+1 (new vertex as first point, rest of original segment as subsequent points)
  const segmentNPlus1Transforms: PolylinePointTransform[] = [
    // New vertex as point 0 of segment N+1
    {
      segmentIndex: targetSegmentIndex + 1,
      pointIndex: 0,
      position: newVertexPosition,
    },
  ];

  // Add the rest of the original segment's points (from point 1 onwards) to segment N+1
  // but shifted: original point 1 becomes point 1, point 2 becomes point 2, etc.
  for (let i = 1; i < effectiveSegment.length; i++) {
    const originalTransform = transformsWithUpdatedIndices.find(
      (t) => t.segmentIndex === targetSegmentIndex && t.pointIndex === i
    );

    // If there was a transform for this point, keep it but with adjusted indices
    if (originalTransform) {
      segmentNPlus1Transforms.push({
        segmentIndex: targetSegmentIndex + 1,
        pointIndex: i,
        position: originalTransform.position,
      });
    } else {
      // Otherwise, create a new transform from the effective point
      segmentNPlus1Transforms.push({
        segmentIndex: targetSegmentIndex + 1,
        pointIndex: i,
        position: effectiveSegment[i],
      });
    }
  }

  // Step 3: Combine all transforms
  // - Remove old transforms for the target segment
  // - Add new transforms for segments N and N+1
  const finalTransforms = [
    ...transformsWithUpdatedIndices.filter(
      (t) => t.segmentIndex !== targetSegmentIndex
    ),
    ...segmentNTransforms,
    ...segmentNPlus1Transforms,
  ];

  return finalTransforms;
}

/**
 * Finds which segment was clicked based on the click position and effective points.
 *
 * @param effectivePoints - Current effective points of the polyline
 * @param clickPosition - Position where user clicked
 * @param maxDistance - Maximum distance to consider a click on a segment (default: 0.1)
 * @returns Segment index and the new vertex position, or null if no segment was close enough
 */
export function findClickedSegment(
  effectivePoints: Vector3Tuple[][],
  clickPosition: Vector3Tuple,
  maxDistance: number = 0.1
): { segmentIndex: number; newVertexPosition: Vector3Tuple } | null {
  let closestSegmentIndex = -1;
  let closestDistance = Infinity;
  let closestPoint: Vector3Tuple | null = null;

  effectivePoints.forEach((segment, segmentIndex) => {
    if (segment.length < 2) return;

    // Check each line in the segment (between consecutive points)
    for (let i = 0; i < segment.length - 1; i++) {
      const start = segment[i];
      const end = segment[i + 1];

      const { closestPoint: pointOnSegment } = findClosestPointOnSegment(
        start,
        end,
        clickPosition
      );

      const distance = new THREE.Vector3(...pointOnSegment).distanceTo(
        new THREE.Vector3(...clickPosition)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestSegmentIndex = segmentIndex;
        closestPoint = pointOnSegment;
      }
    }
  });

  // Check if the closest distance is within the threshold
  if (closestDistance <= maxDistance && closestPoint !== null) {
    return {
      segmentIndex: closestSegmentIndex,
      newVertexPosition: closestPoint,
    };
  }

  return null;
}
