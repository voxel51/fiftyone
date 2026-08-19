import type {
  InterpolatedLocation,
  LocationBounds,
} from "../tracks/location-track";
import {
  mapPlaybackCameraTarget,
  type MapCameraTarget,
} from "../viewport/camera";
import { writeMapViewport } from "../viewport/cache";
import { noteMapFollowCommand } from "./performance";
import type { CometTrail, MapLocationMarker } from "./playback-paint";

type MapLibreMap = import("maplibre-gl").Map;

const FOLLOW_INTERVAL_MS = 1_000 / 15;
const FOLLOW_MIN_MOVEMENT_PX = 1;

/** Follow must stand down while an explicit recenter animation is active. */
export const RECENTER_GUARD_MS = 600;

interface FollowCameraState {
  lastFollowAtMs: number;
}

/** Creates the mutable timestamp used to rate-limit follow commands. */
export function createFollowCameraState(): FollowCameraState {
  return { lastFollowAtMs: Number.NEGATIVE_INFINITY };
}

/** Selects the best initial/recenter target from trail, marker, and route. */
export function playbackCameraTarget(
  bounds: LocationBounds | null,
  currentLocations: readonly MapLocationMarker[],
  comets: readonly CometTrail[],
): MapCameraTarget | null {
  return mapPlaybackCameraTarget({
    bounds,
    marker: currentLocations[0]?.location ?? null,
    trailBounds: coordinateBounds(comets.flatMap((trail) => trail.coordinates)),
  });
}

/** Applies a marker or fitted-bounds camera target through MapLibre. */
export function applyMapCameraTarget(
  map: MapLibreMap,
  target: MapCameraTarget | null,
  duration: number,
): void {
  if (!target) return;
  if (target.kind === "marker") {
    map.easeTo({
      center: [target.longitude, target.latitude],
      duration,
      zoom: target.zoom,
    });
    return;
  }
  map.fitBounds(
    [
      [target.bounds.west, target.bounds.south],
      [target.bounds.east, target.bounds.north],
    ],
    { duration, maxZoom: 17, padding: target.padding },
  );
}

/** Persists the current camera in the dataset-scoped viewport cache. */
export function rememberMapViewport(
  map: MapLibreMap,
  viewportScope: string | null,
): void {
  const center = map.getCenter();
  writeMapViewport(viewportScope, {
    latitude: center.lat,
    longitude: center.lng,
    zoom: map.getZoom(),
  });
}

/** Runs the capped, movement-thresholded follow camera update. */
export function updateFollowCamera({
  cameraReady,
  current,
  enabled,
  map,
  nowMs,
  recenterGuardUntil,
  state,
  suppressViewportWrite,
}: {
  readonly cameraReady: boolean;
  readonly current: InterpolatedLocation | null;
  readonly enabled: boolean;
  readonly map: MapLibreMap;
  readonly nowMs: number;
  readonly recenterGuardUntil: number;
  readonly state: FollowCameraState;
  readonly suppressViewportWrite: { current: boolean };
}): void {
  if (
    !cameraReady ||
    !enabled ||
    !current ||
    nowMs < recenterGuardUntil ||
    nowMs - state.lastFollowAtMs < FOLLOW_INTERVAL_MS
  ) {
    return;
  }
  state.lastFollowAtMs = nowMs;
  const center = map.project(map.getCenter());
  const target = map.project([current.longitude, current.latitude]);
  if (
    Math.hypot(target.x - center.x, target.y - center.y) <
    FOLLOW_MIN_MOVEMENT_PX
  ) {
    return;
  }
  suppressViewportWrite.current = true;
  try {
    noteMapFollowCommand();
    map.jumpTo({ center: [current.longitude, current.latitude] });
  } finally {
    suppressViewportWrite.current = false;
  }
}

function coordinateBounds(
  coordinates: readonly [number, number][],
): LocationBounds | null {
  if (coordinates.length === 0) return null;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return { east, north, south, west };
}
