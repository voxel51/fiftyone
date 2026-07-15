import type { LocationBounds } from "./mcap-location-track";

const PLAYBACK_BOUNDS_PADDING = 80;
const ROUTE_BOUNDS_PADDING = 42;

/** Street-level zoom used when framing a single current location. */
export const MCAP_MAP_MARKER_ZOOM = 16;

/** Camera destination for either a route extent or a current-location marker. */
export type McapMapCameraTarget =
  | {
      readonly bounds: LocationBounds;
      readonly kind: "bounds";
      readonly padding: number;
    }
  | {
      readonly kind: "marker";
      readonly latitude: number;
      readonly longitude: number;
      readonly zoom: number;
    };

/**
 * Chooses the useful playback camera target: recent motion first, then the
 * current fix, with the whole recording retained only as a last-resort frame.
 */
export function mcapMapPlaybackCameraTarget({
  bounds,
  marker,
  trailBounds,
}: {
  readonly bounds: LocationBounds | null;
  readonly marker: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly trailBounds: LocationBounds | null;
}): McapMapCameraTarget | null {
  if (trailBounds) {
    return {
      bounds: trailBounds,
      kind: "bounds",
      padding: PLAYBACK_BOUNDS_PADDING,
    };
  }
  if (marker) {
    return {
      kind: "marker",
      latitude: marker.latitude,
      longitude: marker.longitude,
      zoom: MCAP_MAP_MARKER_ZOOM,
    };
  }
  return bounds ? mcapMapRouteCameraTarget(bounds) : null;
}

/** Builds a camera target that frames an entire route. */
export function mcapMapRouteCameraTarget(
  bounds: LocationBounds,
): McapMapCameraTarget {
  return { bounds, kind: "bounds", padding: ROUTE_BOUNDS_PADDING };
}
