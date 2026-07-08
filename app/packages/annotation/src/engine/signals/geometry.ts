/**
 * The cross-surface GEOMETRY signal: a surface publishes a label's live,
 * mid-gesture geometry (drag/resize/transform) so observers — the sidebar
 * position panels — can preview it before the gesture commits. Render-only:
 * publishing touches no label state; the committed write happens at finalize.
 *
 * One topic, keyed by {@link EntityId}; the payload is discriminated by surface
 * but always ABSOLUTE (the publisher resolves any deltas against the base), so
 * observers stay surface-agnostic.
 */

/** Signal-pipe topic for live label geometry. */
export const GEOMETRY_SIGNAL = "geometry";

/**
 * Live 2D box geometry in the data model's RELATIVE [0,1] space (matching
 * `bounding_box`). The observer renders these directly — no pixel conversion,
 * which would need the scene and round-trip with float drift.
 */
export interface Geometry2d {
  kind: "2d";
  bounds: { x: number; y: number; width: number; height: number };
}

/** Live 3D cuboid geometry — absolute location/dimensions/quaternion. */
export interface Geometry3d {
  kind: "3d";
  location: [number, number, number];
  dimensions: [number, number, number];
  quaternion: [number, number, number, number];
}

export type GeometrySignal = Geometry2d | Geometry3d;
