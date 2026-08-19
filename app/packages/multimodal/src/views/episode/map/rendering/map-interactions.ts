import type { MapMeasurementPoint, MapMeasurementState } from "../measurement";
import type { LocationTrackState } from "../tracks/location-track";
import { MEASURE_PREVIEW_SOURCE_ID } from "./map-sources";
import {
  EMPTY_MAP_FEATURE_COLLECTION,
  setGeoJsonSourceData,
  type MapGeoJsonFeature,
  type MapGeoJsonFeatureCollection,
} from "./route-layers";

type MapLibreMap = import("maplibre-gl").Map;

/** Converts every recorded location point into the map hit-test source. */
export function hitPointFeatures(
  tracks: readonly LocationTrackState[],
): MapGeoJsonFeatureCollection {
  const features: MapGeoJsonFeature[] = [];
  for (const track of tracks) {
    for (const segment of track.segments) {
      for (const point of segment.points) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [point.longitude, point.latitude],
          },
          properties: {
            color: track.color,
            timeNs: point.timeNs.toString(),
            stream: track.stream,
          },
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/** Converts a completed measurement into its committed map line. */
export function measurementLineFeature(
  measurement: MapMeasurementState | null,
): MapGeoJsonFeatureCollection {
  if (!measurement?.b) return EMPTY_MAP_FEATURE_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [measurement.a.longitude, measurement.a.latitude],
            [measurement.b.longitude, measurement.b.latitude],
          ],
        },
        properties: {},
      },
    ],
  };
}

/** Converts an in-progress measurement into its pointer-preview line. */
export function measurementPreviewFeature(
  measurement: MapMeasurementState | null,
  hover: MapMeasurementPoint | null,
): MapGeoJsonFeatureCollection {
  if (!measurement || measurement.b || !hover) {
    return EMPTY_MAP_FEATURE_COLLECTION;
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [measurement.a.longitude, measurement.a.latitude],
            [hover.longitude, hover.latitude],
          ],
        },
        properties: {},
      },
    ],
  };
}

/** Converts the selected measurement endpoints into map point features. */
export function measurementPointFeatures(
  measurement: MapMeasurementState | null,
): MapGeoJsonFeatureCollection {
  if (!measurement) return EMPTY_MAP_FEATURE_COLLECTION;
  const points = measurement.b
    ? [measurement.a, measurement.b]
    : [measurement.a];
  return {
    type: "FeatureCollection",
    features: points.map((point, index) => ({
      id: index,
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
      properties: { index },
    })),
  };
}

/** Coalesces pointer-move measurement preview updates to animation frames. */
export function scheduleMeasurementPreviewUpdate(
  map: MapLibreMap,
  measurementRef: { current: MapMeasurementState | null },
  hoverRef: { current: MapMeasurementPoint | null },
  frameRef: { current: number | null },
): void {
  if (frameRef.current !== null) return;
  frameRef.current = requestAnimationFrame(() => {
    frameRef.current = null;
    setGeoJsonSourceData(
      map,
      MEASURE_PREVIEW_SOURCE_ID,
      measurementPreviewFeature(measurementRef.current, hoverRef.current),
    );
  });
}

/** Reads a bigint playback time from one layer-feature event. */
export function timeNsFromMapEvent(event: {
  readonly features?: readonly {
    readonly properties?: Record<string, unknown>;
  }[];
}): bigint | null {
  const value = event.features?.[0]?.properties?.timeNs;
  if (typeof value === "bigint") return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** Reads a measurement point from one MapLibre pointer event. */
export function measurementPointFromMapEvent(event: {
  readonly lngLat?: { readonly lat: number; readonly lng: number };
}): MapMeasurementPoint | null {
  const lngLat = event.lngLat;
  if (!lngLat) return null;
  if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) return null;
  return { latitude: lngLat.lat, longitude: lngLat.lng };
}
