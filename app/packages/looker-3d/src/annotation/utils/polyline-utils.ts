import type { Vector3Tuple } from "three";
import type { PolylineSegmentTransform, SelectedPoint } from "../types";

/**
 * Applies segment transforms to original polyline points to produce effective points.
 * If transforms exist for a segment, they completely replace the original points for that segment.
 * Otherwise, returns the original segment points.
 *
 * @param originalPoints - Original polyline points (array of segments, where each segment is an array of Vector3Tuple)
 * @param segments - Transforms to apply (array where index IS the segmentIndex)
 * @returns Effective points after applying transforms
 */
export function applyTransformsToPolyline(
  originalPoints: Vector3Tuple[][],
  segments: PolylineSegmentTransform[]
): Vector3Tuple[][] {
  const result: Vector3Tuple[][] = [];

  // Determine the maximum length between originalPoints and segments
  const maxLength = Math.max(originalPoints.length, segments.length);

  for (let i = 0; i < maxLength; i++) {
    // If a transform exists for this segment, use the transformed points
    if (i < segments.length && segments[i]?.points) {
      result.push(segments[i].points);
    } else if (i < originalPoints.length) {
      // Otherwise, use the original points
      result.push(originalPoints[i]);
    }
  }

  return result;
}

/**
 * Applies a delta vector to all points in all segments.
 * Returns new segment transforms with the delta applied.
 *
 * @param effectivePoints - Current effective points (after applying transforms)
 * @param delta - Delta vector [dx, dy, dz] to apply to all points
 * @returns New segment transforms with delta applied
 */
export function applyDeltaToAllPoints(
  effectivePoints: Vector3Tuple[][],
  delta: [number, number, number]
): PolylineSegmentTransform[] {
  const [dx, dy, dz] = delta;

  return effectivePoints.map((segment) => ({
    points: segment.map(
      (point) =>
        [point[0] + dx, point[1] + dy, point[2] + dz] as [
          number,
          number,
          number
        ]
    ),
  }));
}

/**
 * Calculates the squared distance between two 3D points.
 */
function distanceSquared(
  p1: [number, number, number],
  p2: [number, number, number]
): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  const dz = p1[2] - p2[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Calculates the squared distance from a point to a line segment.
 * Returns both the distance and the closest point on the segment.
 */
function pointToLineSegmentDistanceSquared(
  point: [number, number, number],
  lineStart: [number, number, number],
  lineEnd: [number, number, number]
): { distanceSquared: number; closestPoint: [number, number, number] } {
  const [px, py, pz] = point;
  const [ax, ay, az] = lineStart;
  const [bx, by, bz] = lineEnd;

  // Vector from A to B
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;

  // Vector from A to P
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;

  // Project AP onto AB, computing parameterized position t
  const ab_ab = abx * abx + aby * aby + abz * abz;
  const ap_ab = apx * abx + apy * aby + apz * abz;

  // If AB is a point, return distance to that point
  if (ab_ab === 0) {
    return {
      distanceSquared: distanceSquared(point, lineStart),
      closestPoint: lineStart,
    };
  }

  const t = Math.max(0, Math.min(1, ap_ab / ab_ab));

  // Closest point on the line segment
  const closestPoint: [number, number, number] = [
    ax + t * abx,
    ay + t * aby,
    az + t * abz,
  ];

  return {
    distanceSquared: distanceSquared(point, closestPoint),
    closestPoint,
  };
}

/**
 * Finds which segment was clicked based on the click position.
 * Returns the segment index and the position where a new vertex should be inserted.
 *
 * @param effectivePoints - Current effective points
 * @param clickPosition - Position where the user clicked
 * @param distanceThreshold - Maximum distance from segment to consider a click
 * @returns Object with segmentIndex and newVertexPosition, or null if no segment is close enough
 */
export function findClickedSegment(
  effectivePoints: Vector3Tuple[][],
  clickPosition: Vector3Tuple,
  distanceThreshold: number
): { segmentIndex: number; newVertexPosition: Vector3Tuple } | null {
  let closestSegmentIndex = -1;
  let closestDistanceSquared = distanceThreshold * distanceThreshold;
  let closestPoint: Vector3Tuple | null = null;

  // Check each segment
  for (
    let segmentIndex = 0;
    segmentIndex < effectivePoints.length;
    segmentIndex++
  ) {
    const segment = effectivePoints[segmentIndex];

    // Check each line segment within the polyline segment
    for (let i = 0; i < segment.length - 1; i++) {
      const lineStart = segment[i];
      const lineEnd = segment[i + 1];

      const { distanceSquared: dist, closestPoint: point } =
        pointToLineSegmentDistanceSquared(clickPosition, lineStart, lineEnd);

      if (dist < closestDistanceSquared) {
        closestDistanceSquared = dist;
        closestSegmentIndex = segmentIndex;
        closestPoint = point;
      }
    }
  }

  if (closestSegmentIndex === -1 || !closestPoint) {
    return null;
  }

  return {
    segmentIndex: closestSegmentIndex,
    newVertexPosition: closestPoint,
  };
}

/**
 * Inserts a new vertex into a segment at the appropriate position.
 * The vertex is inserted between the two closest existing vertices.
 *
 * @param effectivePoints - Current effective points
 * @param currentSegments - Current segment transforms
 * @param segmentIndex - Index of the segment to insert into
 * @param newVertexPosition - Position of the new vertex
 * @param clickPosition - Original click position (for finding insertion index)
 * @returns New segment transforms with the vertex inserted, or null if the vertex is too close to an existing one
 */
export function insertVertexInSegment(
  effectivePoints: Vector3Tuple[][],
  currentSegments: PolylineSegmentTransform[],
  segmentIndex: number,
  newVertexPosition: Vector3Tuple,
  clickPosition: Vector3Tuple
): PolylineSegmentTransform[] | null {
  const MIN_VERTEX_DISTANCE = 0.05; // Minimum distance between vertices

  if (segmentIndex < 0 || segmentIndex >= effectivePoints.length) {
    return null;
  }

  const segment = effectivePoints[segmentIndex];

  // Find the insertion index - between which two vertices should we insert
  let insertionIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < segment.length - 1; i++) {
    const lineStart = segment[i];
    const lineEnd = segment[i + 1];

    const { distanceSquared: dist } = pointToLineSegmentDistanceSquared(
      clickPosition,
      lineStart,
      lineEnd
    );

    if (dist < minDistance) {
      minDistance = dist;
      // Insert after vertex i
      insertionIndex = i + 1;
    }
  }

  if (insertionIndex === -1) {
    return null;
  }

  // Check if the new vertex is too close to any existing vertex
  for (const point of segment) {
    if (
      distanceSquared(newVertexPosition, point) <
      MIN_VERTEX_DISTANCE * MIN_VERTEX_DISTANCE
    ) {
      return null; // Too close, don't insert
    }
  }

  // Create new segments array with the inserted vertex
  const newSegments = [...currentSegments];

  // Ensure we have a segment transform for this segment index
  while (newSegments.length <= segmentIndex) {
    newSegments.push({ points: [] });
  }

  // Get the current points for this segment (from effective points)
  const newPoints = [...segment];
  newPoints.splice(insertionIndex, 0, newVertexPosition);

  newSegments[segmentIndex] = {
    points: newPoints,
  };

  return newSegments;
}

/**
 * Checks if the current position is close enough to the first vertex to close the loop.
 *
 * @param vertices - Current vertices in the polyline
 * @param currentPosition - Current mouse position
 * @param tolerance - Distance tolerance for closing the loop
 * @returns True if the loop should be closed
 */
export function shouldClosePolylineLoop(
  vertices: Vector3Tuple[],
  currentPosition: Vector3Tuple,
  tolerance: number
): boolean {
  if (vertices.length < 3) {
    return false; // Need at least 3 vertices to close a loop
  }

  const firstVertex = vertices[0];
  const distance = Math.sqrt(distanceSquared(currentPosition, firstVertex));

  return distance <= tolerance;
}

/**
 * Gets the position of a specific vertex in a polyline.
 * If transforms exist for that vertex, returns the transformed position.
 * Otherwise, returns the original position.
 *
 * @param selectedPoint - The selected point (with labelId, segmentIndex, pointIndex)
 * @param originalPoints - Original polyline points
 * @param segments - Current segment transforms
 * @returns The position of the vertex, or null if not found
 */
export function getVertexPosition(
  selectedPoint: SelectedPoint,
  originalPoints: Vector3Tuple[][],
  segments: PolylineSegmentTransform[]
): Vector3Tuple | null {
  const { segmentIndex, pointIndex } = selectedPoint;

  // First, try to get from transforms
  if (
    segmentIndex < segments.length &&
    segments[segmentIndex]?.points &&
    pointIndex < segments[segmentIndex].points.length
  ) {
    return segments[segmentIndex].points[pointIndex];
  }

  // Fall back to original points
  if (
    segmentIndex < originalPoints.length &&
    pointIndex < originalPoints[segmentIndex].length
  ) {
    return originalPoints[segmentIndex][pointIndex];
  }

  return null;
}

/**
 * Updates the position of a specific vertex in the transforms.
 * If the vertex is shared between multiple segments (appears at the same position),
 * updates all occurrences.
 *
 * @param effectivePoints - Current effective points
 * @param currentSegments - Current segment transforms
 * @param segmentIndex - Segment index of the vertex to update
 * @param pointIndex - Point index within the segment
 * @param newPosition - New position for the vertex
 * @param updateShared - Whether to update all shared vertices with the same position
 * @returns New segment transforms with the vertex updated
 */
export function updateVertexPosition(
  effectivePoints: Vector3Tuple[][],
  currentSegments: PolylineSegmentTransform[],
  segmentIndex: number,
  pointIndex: number,
  newPosition: Vector3Tuple,
  updateShared = true
): PolylineSegmentTransform[] {
  if (
    segmentIndex < 0 ||
    segmentIndex >= effectivePoints.length ||
    pointIndex < 0 ||
    pointIndex >= effectivePoints[segmentIndex].length
  ) {
    return currentSegments;
  }

  // Get the current position of the vertex to update
  const currentPosition = effectivePoints[segmentIndex][pointIndex];

  // Find all vertices that share this position (if updateShared is true)
  const verticesToUpdate: Array<{
    segmentIndex: number;
    pointIndex: number;
  }> = [];

  if (updateShared) {
    for (let si = 0; si < effectivePoints.length; si++) {
      for (let pi = 0; pi < effectivePoints[si].length; pi++) {
        const point = effectivePoints[si][pi];
        // Check if this point is at the same position (within a small tolerance)
        if (
          Math.abs(point[0] - currentPosition[0]) < 0.0001 &&
          Math.abs(point[1] - currentPosition[1]) < 0.0001 &&
          Math.abs(point[2] - currentPosition[2]) < 0.0001
        ) {
          verticesToUpdate.push({ segmentIndex: si, pointIndex: pi });
        }
      }
    }
  } else {
    verticesToUpdate.push({ segmentIndex, pointIndex });
  }

  // Create new segments array
  const newSegments = [...currentSegments];

  // Update all vertices
  for (const vertex of verticesToUpdate) {
    const { segmentIndex: si, pointIndex: pi } = vertex;

    // Ensure we have a segment transform for this segment index
    while (newSegments.length <= si) {
      newSegments.push({ points: [] });
    }

    // Get current points for this segment
    // If segment transform exists and has points, use it; otherwise use effective points
    let currentPoints: Vector3Tuple[];
    if (newSegments[si]?.points && newSegments[si].points.length > 0) {
      currentPoints = newSegments[si].points;
    } else if (effectivePoints[si]) {
      currentPoints = effectivePoints[si];
    } else {
      currentPoints = [];
    }

    const newPoints = [...currentPoints];

    // Update the point
    if (pi < newPoints.length) {
      newPoints[pi] = newPosition;
    }

    newSegments[si] = {
      points: newPoints,
    };
  }

  return newSegments;
}

/**
 * Sanitizes label attributes.
 *
 * @param misc - The misc attributes to sanitize
 * @returns The sanitized misc attributes
 */
export function sanitizeSchemaIoLabelAttributes(
  misc: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(misc).map(([key, value]) => {
      if (value === "true") return [key, true];
      if (value === "false") return [key, false];
      return [key, value];
    })
  );
}
