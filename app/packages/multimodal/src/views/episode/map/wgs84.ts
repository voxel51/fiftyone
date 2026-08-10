/**
 * Minimal WGS84 spherical math shared by the map tile's route and
 * measurement features.
 */

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

const MEAN_EARTH_RADIUS_M = 6_371_008.8;

/** Canonical longitude persisted outside the continuous map representation. */
export function wrapLongitude(longitude: number): number {
  if (!Number.isFinite(longitude)) return longitude;
  if (longitude >= -180 && longitude < 180) return longitude;
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** Nearest world-copy longitude to a continuous reference longitude. */
export function unwrapLongitude(longitude: number, reference: number): number {
  if (!Number.isFinite(longitude) || !Number.isFinite(reference)) {
    return longitude;
  }
  const wrapped = wrapLongitude(longitude);
  return wrapped + 360 * Math.round((reference - wrapped) / 360);
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Initial great-circle bearing from `from` to `to`, in degrees clockwise
 * from north, or `undefined` for coincident points.
 */
export function bearingDegrees(
  from: GeoPoint,
  to: GeoPoint,
): number | undefined {
  if (from.latitude === to.latitude && from.longitude === to.longitude) {
    return undefined;
  }
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const deltaLon = degreesToRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle (haversine) distance in meters on the mean-radius sphere. */
export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latA = degreesToRadians(a.latitude);
  const latB = degreesToRadians(b.latitude);
  const deltaLat = degreesToRadians(b.latitude - a.latitude);
  const deltaLon = degreesToRadians(b.longitude - a.longitude);
  const sinHalfLat = Math.sin(deltaLat / 2);
  const sinHalfLon = Math.sin(deltaLon / 2);
  const h =
    sinHalfLat * sinHalfLat +
    Math.cos(latA) * Math.cos(latB) * sinHalfLon * sinHalfLon;

  return 2 * MEAN_EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
