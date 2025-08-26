import * as THREE from "three";
import { Matrix4, Shape, ShapeGeometry, Vector3 } from "three";

/**
 * POLYGON FILLING UTILITIES
 *
 * The polyline filling algorithm reconstructs closed loops from unordered line
 * segments and creates filled polygon meshes positioned in 3D space.
 *
 * Key Algorithm Steps:
 * 1. Reconstruct closed loops from unordered segments
 * 2. Estimate plane of each loop using Newell's method
 * 3. Build orthonormal basis for the plane
 * 4. Project 3D vertices to 2D in the loop's plane
 * 5. Triangulate the 2D polygon using THREE.ShapeGeometry
 * 6. Map triangles back to 3D by applying plane basis transform
 * 7. Render with transparent, double-sided material
 */

const EPS = 1e-6;

/**
 * Creates a unique string key for a 3D point to use in graph operations.
 * This enables efficient vertex deduplication and adjacency tracking.
 */
const keyFor = (p: THREE.Vector3Tuple): string =>
  `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`;

/**
 * Reconstructs closed loops from unordered line segments.
 *
 * Algorithm:
 * 1. Build adjacency sets and edge multiset from segments
 * 2. While unused edges remain:
 *    - Start at any vertex with degree > 0
 *    - Follow available edges to form a cycle
 *    - Consume edges as they're traversed
 *    - Validate cycle: ≥3 unique vertices and returns to start
 *
 * Edge cases handled:
 * - Duplicate segments (handled by edge multiset)
 * - Tiny back-and-forth edges
 * - Dangling edges (ignored when they cannot close)
 */
export function buildClosedLoopsFromSegments(
  segments: THREE.Vector3Tuple[][]
): THREE.Vector3Tuple[][] {
  // Undirected multigraph representation using endpoint keys
  const neighbors = new Map<string, Set<string>>();
  const pointByKey = new Map<string, THREE.Vector3Tuple>();
  const edgeCount = new Map<string, number>();

  /**
   * Adds an undirected edge between two points to the graph.
   * Handles duplicate edges by maintaining a count in edgeCount.
   */
  const addEdge = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple) => {
    const ka = keyFor(a);
    const kb = keyFor(b);

    // Skip self-loops
    if (ka === kb) return;

    // Initialize adjacency sets if needed
    if (!neighbors.has(ka)) neighbors.set(ka, new Set());
    if (!neighbors.has(kb)) neighbors.set(kb, new Set());

    // Add bidirectional edges
    neighbors.get(ka)!.add(kb);
    neighbors.get(kb)!.add(ka);

    // Store point data for later reconstruction
    pointByKey.set(ka, a);
    pointByKey.set(kb, b);

    // Track edge usage count (for multigraph support)
    const e1 = `${ka}|${kb}`;
    const e2 = `${kb}|${ka}`;
    edgeCount.set(e1, (edgeCount.get(e1) || 0) + 1);
    edgeCount.set(e2, (edgeCount.get(e2) || 0) + 1);
  };

  // Build graph from all segments
  for (const seg of segments) {
    // Skip invalid segments
    if (seg.length < 2) continue;
    addEdge(seg[0], seg[1]);
  }

  /**
   * Consumes one usage of an edge and returns true if successful.
   * Returns false if the edge has no remaining uses.
   */
  const useEdge = (ka: string, kb: string): boolean => {
    const e1 = `${ka}|${kb}`;
    const e2 = `${kb}|${ka}`;
    const c1 = (edgeCount.get(e1) || 0) - 1;
    const c2 = (edgeCount.get(e2) || 0) - 1;

    if (c1 < 0 || c2 < 0) return false; // No more uses available

    // Update or remove edge counts
    if (c1 === 0) edgeCount.delete(e1);
    else edgeCount.set(e1, c1);
    if (c2 === 0) edgeCount.delete(e2);
    else edgeCount.set(e2, c2);

    return true;
  };

  const loops: THREE.Vector3Tuple[][] = [];

  /**
   * Finds any vertex that still has unused edges.
   * Used to start new loop construction.
   */
  const pickAnyVertexWithEdges = (): string | null => {
    for (const k of neighbors.keys()) {
      for (const n of neighbors.get(k) || []) {
        if (edgeCount.get(`${k}|${n}`)) return k;
      }
    }
    return null;
  };

  // Main loop: extract cycles while edges remain
  while (true) {
    const start = pickAnyVertexWithEdges();
    if (!start) break; // No more edges to process

    const loopKeys: string[] = [];
    let current = start;
    let prev: string | null = null;

    loopKeys.push(current);

    // Walk along edges until we return to start or hit a dead-end
    while (true) {
      const nbrs = Array.from(neighbors.get(current) || []);

      // Prefer neighbor that still has an unused edge and isn't the previous vertex
      let next: string | null = null;
      for (const n of nbrs) {
        if (prev && n === prev) continue; // Avoid backtracking
        if (edgeCount.get(`${current}|${n}`)) {
          next = n;
          break;
        }
      }

      // Fallback to previous vertex if that's the only remaining option
      if (!next && prev && edgeCount.get(`${current}|${prev}`)) next = prev;
      if (!next) break; // No more edges from this vertex

      // Consume the edge and move to next vertex
      useEdge(current, next);
      prev = current;
      current = next;
      loopKeys.push(current);

      // Check if we've completed a cycle
      if (current === start) break;
    }

    // Validate the extracted cycle
    // Must have at least 4 points (including duplicate start/end) and be closed
    if (loopKeys.length >= 4 && loopKeys[0] === loopKeys[loopKeys.length - 1]) {
      // Convert keys back to 3D points, dropping the duplicate last point
      const pts: THREE.Vector3Tuple[] = loopKeys
        .slice(0, -1)
        .map((k) => pointByKey.get(k)!);

      // Ensure we have at least 3 unique points (minimum for a polygon)
      if (pts.length >= 3) loops.push(pts);
    }
  }

  return loops;
}

/**
 * Computes the unit normal vector for a polygon using Newell's method.
 *
 * Newell's method computes the normal as the
 * average of the cross products of adjacent edges.
 */
export function newellNormal(pts: Vector3[]): Vector3 {
  const n = new Vector3(0, 0, 0);

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    // Wrap around to first point
    const nxt = pts[(i + 1) % pts.length];

    // accumulate cross products
    n.x += (cur.y - nxt.y) * (cur.z + nxt.z);
    n.y += (cur.z - nxt.z) * (cur.x + nxt.x);
    n.z += (cur.x - nxt.x) * (cur.y + nxt.y);
  }

  // normalize the result, fallback to (0,0,1) if degenerate
  return n.length() > EPS ? n.normalize() : new Vector3(0, 0, 1);
}

/**
 * Creates a filled polygon mesh from a closed loop of 3D points.
 *
 * This function implements the complete polygon filling pipeline:
 * 1. Plane estimation using Newell's method
 * 2. Construction of orthonormal basis for the plane
 * 3. Projection of 3D points to 2D
 * 4. Triangulation using THREE.ShapeGeometry
 * 5. Lifting back to 3D space
 */
export function createFilledPolygonMesh(
  loop: THREE.Vector3Tuple[],
  material: THREE.Material
): THREE.Mesh | null {
  try {
    // Validate input: need at least 3 points for a polygon
    if (loop.length < 3) {
      return null;
    }

    // Convert tuples to Vector3 objects for calculations
    const pts3 = loop.map((p) => new Vector3(p[0], p[1], p[2]));

    // Check for degenerate cases (all points are the same)
    const firstPoint = pts3[0];
    const allSame = pts3.every(
      (pt) =>
        Math.abs(pt.x - firstPoint.x) < EPS &&
        Math.abs(pt.y - firstPoint.y) < EPS &&
        Math.abs(pt.z - firstPoint.z) < EPS
    );
    if (allSame) {
      return null;
    }

    const origin = pts3[0].clone();

    // Step 1: Estimate the plane normal using Newell's method
    const normal = newellNormal(pts3);

    // Step 2: Build orthonormal basis for the plane
    // Choose a stable reference axis that's not too close to the normal
    const ref =
      Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);

    // Construct basis vectors: u = normal × ref, v = normal × u
    const u = new Vector3().crossVectors(normal, ref).normalize();
    const v = new Vector3().crossVectors(normal, u).normalize();

    // Step 3: Project 3D points to 2D in the plane
    const toLocal = (p: Vector3) => {
      const d = new Vector3().subVectors(p, origin);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    };
    const pts2 = pts3.map(toLocal);

    // Step 4: Build THREE.Shape from 2D points and ensure closure
    const shape = new Shape();
    shape.moveTo(pts2[0].x, pts2[0].y);

    // Add line segments between points
    for (let i = 1; i < pts2.length; i++) {
      shape.lineTo(pts2[i].x, pts2[i].y);
    }

    // Explicitly close the shape by returning to the first point
    shape.lineTo(pts2[0].x, pts2[0].y);

    // Step 5: Generate triangulated geometry using Earcut
    const geom2d = new ShapeGeometry(shape);

    // Step 6: Transform from XY plane back to the original 3D plane
    // Create basis matrix [u, v, normal] with origin translation
    const basis = new Matrix4().makeBasis(u, v, normal);
    basis.setPosition(origin);

    // Apply the transformation to move triangles to 3D space
    geom2d.applyMatrix4(basis);

    // Step 7: Create and return the mesh
    return new THREE.Mesh(geom2d, material);
  } catch (error) {
    // Handle triangulation failures gracefully
    console.warn("Failed to create filled polygon mesh:", error);
    return null;
  }
}

/**
 * Creates filled polygon meshes from polyline segments.
 *
 * This is the main entry point for polygon filling. It handles the complete
 * pipeline from unordered segments to rendered filled polygons.
 *
 * @param points3d - Array of line segments
 * @param material - THREE material to use for the meshes
 * @returns Array of THREE.Mesh objects, or null if no valid polygons found
 */
export function createFilledPolygonMeshes(
  points3d: THREE.Vector3Tuple[][],
  material: THREE.Material
): THREE.Mesh[] | null {
  // Case 1: Single polyline with 3+ points (already a closed loop)
  const candidateLoops: THREE.Vector3Tuple[][] =
    points3d.length === 1 && points3d[0].length >= 3
      ? [points3d[0]]
      : buildClosedLoopsFromSegments(points3d);

  if (candidateLoops.length === 0) {
    return null;
  }

  const meshes: THREE.Mesh[] = [];
  for (const loop of candidateLoops) {
    const mesh = createFilledPolygonMesh(loop, material);
    if (mesh) {
      meshes.push(mesh);
    }
  }

  return meshes.length > 0 ? meshes : null;
}
