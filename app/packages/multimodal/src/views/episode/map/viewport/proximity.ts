import type { EpisodeMapViewport } from "./cache";
import type { LocationBounds } from "../tracks/location-track";

const TILE_SIZE = 512;
const MAX_MERCATOR_LATITUDE = 85.051129;
const VIEWPORT_EXPANSION = 0.5;

type Rect = {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
};

/**
 * Whether the new recording has location evidence near a cached viewport.
 * The comparison is performed in projected pixels at the cached zoom, so the
 * threshold scales naturally from street level to regional views.
 */
export function episodeMapViewportIsNearEvidence({
  bounds,
  height,
  marker,
  viewport,
  width,
}: {
  readonly bounds: LocationBounds | null;
  readonly height: number;
  readonly marker: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly viewport: EpisodeMapViewport;
  readonly width: number;
}): boolean {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(viewport.latitude) ||
    !Number.isFinite(viewport.longitude) ||
    !Number.isFinite(viewport.zoom)
  ) {
    return false;
  }
  const validMarker =
    marker && locationIsValid(marker.longitude, marker.latitude)
      ? marker
      : null;
  const validBounds = bounds && boundsAreValid(bounds) ? bounds : null;

  const center = project(viewport.longitude, viewport.latitude, viewport.zoom);
  const expanded = {
    bottom: height * (1 + VIEWPORT_EXPANSION),
    left: -width * VIEWPORT_EXPANSION,
    right: width * (1 + VIEWPORT_EXPANSION),
    top: -height * VIEWPORT_EXPANSION,
  };
  const toScreen = (longitude: number, latitude: number) => {
    const point = project(longitude, latitude, viewport.zoom);
    const worldSize = TILE_SIZE * 2 ** viewport.zoom;
    let dx = point.x - center.x;
    if (dx > worldSize / 2) dx -= worldSize;
    if (dx < -worldSize / 2) dx += worldSize;
    return { x: width / 2 + dx, y: height / 2 + point.y - center.y };
  };

  const markerPoint = validMarker
    ? toScreen(validMarker.longitude, validMarker.latitude)
    : null;
  if (
    markerPoint &&
    pointIsFinite(markerPoint) &&
    pointInRect(markerPoint, expanded)
  ) {
    return true;
  }
  if (!validBounds) return false;

  const intervals =
    validBounds.west <= validBounds.east
      ? [[validBounds.west, validBounds.east] as const]
      : [[validBounds.west, 180] as const, [-180, validBounds.east] as const];
  return intervals.some(([west, east]) => {
    const northwest = toScreen(west, validBounds.north);
    const southeast = toScreen(east, validBounds.south);
    if (!pointIsFinite(northwest) || !pointIsFinite(southeast)) return false;
    return rectanglesIntersect(
      {
        bottom: Math.max(northwest.y, southeast.y),
        left: Math.min(northwest.x, southeast.x),
        right: Math.max(northwest.x, southeast.x),
        top: Math.min(northwest.y, southeast.y),
      },
      expanded,
    );
  });
}

function locationIsValid(longitude: number, latitude: number): boolean {
  return (
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function boundsAreValid(bounds: LocationBounds): boolean {
  if (
    !locationIsValid(bounds.west, bounds.north) ||
    !locationIsValid(bounds.east, bounds.south) ||
    bounds.south > bounds.north
  ) {
    return false;
  }
  const longitudeSpan =
    bounds.west <= bounds.east
      ? bounds.east - bounds.west
      : 180 - bounds.west + (bounds.east + 180);
  // A route spanning more than half the world is ambiguous after longitude
  // wrapping. Rejecting the cache is safer than restoring the wrong region.
  return longitudeSpan <= 180;
}

function pointIsFinite(point: { readonly x: number; readonly y: number }) {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function project(longitude: number, latitude: number, zoom: number) {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * worldSize,
    y:
      (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) *
      worldSize,
  };
}

function pointInRect(
  point: { readonly x: number; readonly y: number },
  rect: Rect,
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

function rectanglesIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.right < b.left ||
    a.left > b.right ||
    a.bottom < b.top ||
    a.top > b.bottom
  );
}
