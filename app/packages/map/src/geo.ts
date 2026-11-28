import type { SampleLocationMap } from "./useFetchGeoLocations";

/**
 * Whether a [longitude, latitude] pair falls within valid GeoJSON bounds.
 */
export const isValidCoordinate = ([lng, lat]: [number, number]): boolean => {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
};

/**
 * Filters out samples whose coordinates fall outside the valid
 * longitude/latitude bounds. Users may intentionally store out-of-range
 * values, eg when ingesting raw data for cleaning, so these points are
 * silently excluded from map rendering rather than raising an error.
 */
export const filterValidSampleLocations = (
  sampleLocationMap: SampleLocationMap,
): SampleLocationMap => {
  const result: SampleLocationMap = {};
  for (const [id, coordinates] of Object.entries(sampleLocationMap)) {
    if (isValidCoordinate(coordinates)) {
      result[id] = coordinates;
    }
  }

  return result;
};
