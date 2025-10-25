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
  if (points3d.length === 0) {
    return null;
  }

  // Filter to only polylines with 3+ points (we don't fill disjoint segments)
  const polylines = points3d.filter((segment) => segment.length >= 3);

  if (polylines.length === 0) {
    return null;
  }

  const meshes: THREE.Mesh[] = [];
  for (const polyline of polylines) {
    const mesh = createFilledPolygonMesh(polyline, material);
    if (mesh) {
      meshes.push(mesh);
    }
  }

  return meshes.length > 0 ? meshes : null;
}
