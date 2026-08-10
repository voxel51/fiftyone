import type { MapViewport } from "./cache";
import type { LocationBounds } from "../tracks/location-track";
import { normalizeLongitudeIntervalEast, unwrapLongitude } from "../wgs84";

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
export function mapViewportIsNearEvidence({
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
  readonly viewport: MapViewport;
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
    return {
      x: width / 2 + point.x - center.x,
      y: height / 2 + point.y - center.y,
    };
  };

  const markerPoint = validMarker
    ? toScreen(
        unwrapLongitude(validMarker.longitude, viewport.longitude),
        validMarker.latitude,
      )
    : null;
  if (
    markerPoint &&
    pointIsFinite(markerPoint) &&
    pointInRect(markerPoint, expanded)
  ) {
    return true;
  }
  if (!validBounds) return false;

  const east = normalizeLongitudeIntervalEast(
    validBounds.west,
    validBounds.east,
  );
  if (east === null) return false;
  const boundsCenter = (validBounds.west + east) / 2;
  const nearestCenter = unwrapLongitude(boundsCenter, viewport.longitude);
  const shift = nearestCenter - boundsCenter;
  const northwest = toScreen(validBounds.west + shift, validBounds.north);
  const southeast = toScreen(east + shift, validBounds.south);
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
}

function locationIsValid(longitude: number, latitude: number): boolean {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90
  );
}

function boundsAreValid(bounds: LocationBounds): boolean {
  if (
    !Number.isFinite(bounds.west) ||
    !Number.isFinite(bounds.east) ||
    !Number.isFinite(bounds.north) ||
    !Number.isFinite(bounds.south) ||
    bounds.north < -90 ||
    bounds.north > 90 ||
    bounds.south < -90 ||
    bounds.south > 90 ||
    bounds.south > bounds.north
  ) {
    return false;
  }
  const east = normalizeLongitudeIntervalEast(bounds.west, bounds.east);
  return east !== null && east - bounds.west <= 360;
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
