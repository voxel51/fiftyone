/**
 * Types for 3D-to-2D cuboid projection.
 */

export interface ProjectedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ProjectedCorner {
  u: number;
  v: number;
  z: number;
}

export interface CuboidProjectionData {
  edges: ProjectedEdge[];
  corners: (ProjectedCorner | null)[];
}
