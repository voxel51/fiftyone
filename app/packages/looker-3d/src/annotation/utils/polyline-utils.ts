import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { SNAP_TOLERANCE } from "../../constants";
import type { PolylinePointTransform } from "../../state";

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
  const segmentsWithThisPoint = transforms.filter(
    (transform) =>
      transform.position[0] === position[0] &&
      transform.position[1] === position[1] &&
      transform.position[2] === position[2]
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
