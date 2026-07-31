import type {
  PolylineProjectionData,
  ProjectedCorner,
  ProjectedEdge,
} from "../projection/types";
import type { Native2dPolyline } from "./types";

export interface Native2dPolylinePixelData extends PolylineProjectionData {
  /** Per-segment pixel points, so a `filled` polyline can be drawn as polygons. */
  segments: ProjectedCorner[][];
}

/**
 * Converts a stored 2D polyline (normalized [x, y] points) into the pixel-space
 * {@link PolylineProjectionData} consumed by `SvgPolylineProjection`.
 *
 * This is the non-frustum analog of `useProjectedPolyline`: the points are
 * already in image space, so we simply scale the normalized coordinates by the
 * image dimensions instead of projecting through the camera.
 */
export const buildPolylinePixelData = (
  polyline: Native2dPolyline,
  imgW: number,
  imgH: number,
): Native2dPolylinePixelData => {
  const edges: ProjectedEdge[] = [];
  const vertices: (ProjectedCorner | null)[] = [];
  const segments: ProjectedCorner[][] = [];

  for (const segment of polyline.points) {
    if (!Array.isArray(segment) || segment.length === 0) continue;

    const pts = segment.map(([x, y]) => ({ u: x * imgW, v: y * imgH, z: 0 }));
    segments.push(pts);

    for (const p of pts) {
      vertices.push(p);
    }

    for (let i = 0; i < pts.length - 1; i++) {
      edges.push({
        x1: pts[i].u,
        y1: pts[i].v,
        x2: pts[i + 1].u,
        y2: pts[i + 1].v,
      });
    }

    if (polyline.closed && pts.length > 2) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      edges.push({ x1: last.u, y1: last.v, x2: first.u, y2: first.v });
    }
  }

  return { edges, vertices, segments };
};
