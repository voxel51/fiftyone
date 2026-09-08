import {
  indexLocationTrack,
  type IndexedLocationTrack,
  type LocationTrackState,
} from "../tracks/location-track";
import { hexColorWithAlpha } from "./puck";
import { noteMapSourceUpdate } from "./performance";
import { ACCURACY_LAYER_ID, PULSE_LAYER_ID } from "./map-sources";

type MapLibreMap = import("maplibre-gl").Map;

const COMET_ID_PREFIX = "episode-location-comet:";
const ROUTE_ID_PREFIX = "episode-location-route:";
const FUTURE_ROUTE_COLOR = "#8b98a9";
const ROUTE_CASING_COLOR = "#0b1220";
const ROUTE_CASING_WIDTH = 6;
const ROUTE_COLOR_WIDTH = 4;
const ROUTE_PAST_OPACITY = 0.9;
const COMET_TAIL_ALPHA = 0.55;
const COMET_WIDTH = 4.5;

/** Minimal GeoJSON feature shape accepted by the map rendering helpers. */
export interface MapGeoJsonFeature {
  readonly id?: string | number;
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "LineString" | "Point";
    readonly coordinates: readonly unknown[];
  };
  readonly properties: Record<string, string | number | boolean | undefined>;
}

/** GeoJSON feature collection used by mutable MapLibre sources. */
export interface MapGeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly MapGeoJsonFeature[];
}

/** Location track paired with its stable layer key and spatial index. */
export interface IndexedMapTrack {
  readonly index: IndexedLocationTrack;
  readonly key: string;
  readonly track: LocationTrackState;
}

/** Shared immutable empty collection for cleared map sources. */
export const EMPTY_MAP_FEATURE_COLLECTION: MapGeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const indexedLocationTrackByState = new WeakMap<
  LocationTrackState,
  IndexedLocationTrack
>();

/** Creates the stable layer identity and spatial index for one track state. */
export function createIndexedMapTrack(
  track: LocationTrackState,
): IndexedMapTrack {
  let index = indexedLocationTrackByState.get(track);
  if (!index) {
    index = indexLocationTrack(track.segments);
    indexedLocationTrackByState.set(track, index);
  }
  return { index, key: `${track.color}:${track.stream}`, track };
}

/** Returns the stable MapLibre source identifier for one route. */
export function routeSourceId(key: string): string {
  return `${ROUTE_ID_PREFIX}${key}`;
}

/** Returns the stable MapLibre layer identifier for one route layer kind. */
export function routeLayerId(key: string, kind: string): string {
  return `${routeSourceId(key)}:${kind}`;
}

/** Returns the stable MapLibre source identifier for one comet trail. */
export function cometSourceId(key: string): string {
  return `${COMET_ID_PREFIX}${key}`;
}

/** Reconciles route/comet sources and layers with the prepared track set. */
export function reconcileTrackLayers(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
  installed: Map<string, LocationTrackState>,
): void {
  const wanted = new Map(tracks.map((track) => [track.key, track]));
  for (const key of installed.keys()) {
    if (!wanted.has(key)) {
      removeTrackLayers(map, key);
      installed.delete(key);
    }
  }
  for (const indexedTrack of tracks) {
    const installedTrack = installed.get(indexedTrack.key);
    if (!installedTrack) {
      addTrackRouteLayers(map, indexedTrack);
      addCometLayer(map, indexedTrack);
    } else if (installedTrack !== indexedTrack.track) {
      setGeoJsonSourceData(
        map,
        routeSourceId(indexedTrack.key),
        staticRouteFeatures(indexedTrack),
      );
    }
    installed.set(indexedTrack.key, indexedTrack.track);
  }
}

/** Restores current structural geometry after MapLibre replaces its style. */
export function rehydrateTrackLayers(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
  installed: Map<string, LocationTrackState>,
): void {
  for (const { key } of tracks) {
    if (installed.has(key) && !hasTrackLayerResources(map, key)) {
      removeTrackLayers(map, key);
      installed.delete(key);
    }
  }
  reconcileTrackLayers(map, tracks, installed);
  for (const indexedTrack of tracks) {
    setGeoJsonSourceData(
      map,
      routeSourceId(indexedTrack.key),
      staticRouteFeatures(indexedTrack),
    );
  }
}

function addTrackRouteLayers(
  map: MapLibreMap,
  indexedTrack: IndexedMapTrack,
): void {
  const { key, track } = indexedTrack;
  const source = routeSourceId(key);
  map.addSource(source, {
    type: "geojson",
    data: staticRouteFeatures(indexedTrack),
    lineMetrics: true,
  } as never);
  const layout = { "line-cap": "round", "line-join": "round" } as const;
  const segment = ["get", "segmentIndex"];
  const noPast = ["<", segment, 0];
  const allFuture = [">=", segment, 0];
  const noActive = ["==", segment, -1];
  map.addLayer(
    {
      id: routeLayerId(key, "future-casing"),
      type: "line",
      source,
      filter: allFuture,
      layout,
      paint: {
        "line-color": ROUTE_CASING_COLOR,
        "line-opacity": 0.55,
        "line-width": ROUTE_CASING_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
  map.addLayer(
    {
      id: routeLayerId(key, "future"),
      type: "line",
      source,
      filter: allFuture,
      layout,
      paint: {
        "line-color": FUTURE_ROUTE_COLOR,
        "line-opacity": 0.3,
        "line-width": ROUTE_COLOR_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
  map.addLayer(
    {
      id: routeLayerId(key, "past-casing"),
      type: "line",
      source,
      filter: noPast,
      layout,
      paint: {
        "line-color": ROUTE_CASING_COLOR,
        "line-opacity": 0.85,
        "line-width": ROUTE_CASING_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
  map.addLayer(
    {
      id: routeLayerId(key, "past"),
      type: "line",
      source,
      filter: noPast,
      layout,
      paint: {
        "line-color": track.color,
        "line-opacity": ROUTE_PAST_OPACITY,
        "line-width": ROUTE_COLOR_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
  map.addLayer(
    {
      id: routeLayerId(key, "active-casing"),
      type: "line",
      source,
      filter: noActive,
      layout,
      paint: {
        "line-gradient": activeRouteGradient(
          ROUTE_CASING_COLOR,
          0.85,
          ROUTE_CASING_COLOR,
          0.55,
          0,
        ),
        "line-width": ROUTE_CASING_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
  map.addLayer(
    {
      id: routeLayerId(key, "active"),
      type: "line",
      source,
      filter: noActive,
      layout,
      paint: {
        "line-gradient": activeRouteGradient(
          track.color,
          ROUTE_PAST_OPACITY,
          FUTURE_ROUTE_COLOR,
          0.3,
          0,
        ),
        "line-width": ROUTE_COLOR_WIDTH,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
}

function addCometLayer(map: MapLibreMap, indexedTrack: IndexedMapTrack): void {
  const source = cometSourceId(indexedTrack.key);
  map.addSource(source, {
    type: "geojson",
    data: EMPTY_MAP_FEATURE_COLLECTION,
    lineMetrics: true,
  } as never);
  map.addLayer(
    {
      id: source,
      type: "line",
      source,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          hexColorWithAlpha(indexedTrack.track.color, COMET_TAIL_ALPHA),
          1,
          indexedTrack.track.color,
        ],
        "line-width": COMET_WIDTH,
      },
    } as never,
    PULSE_LAYER_ID,
  );
}

function removeTrackLayers(map: MapLibreMap, key: string): void {
  const layers = [
    routeLayerId(key, "active"),
    routeLayerId(key, "active-casing"),
    routeLayerId(key, "past"),
    routeLayerId(key, "past-casing"),
    routeLayerId(key, "future"),
    routeLayerId(key, "future-casing"),
    cometSourceId(key),
  ];
  for (const layer of layers) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of [routeSourceId(key), cometSourceId(key)]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

function hasTrackLayerResources(map: MapLibreMap, key: string): boolean {
  if (
    !map.getSource(routeSourceId(key)) ||
    !map.getSource(cometSourceId(key))
  ) {
    return false;
  }
  return (
    [
      "active",
      "active-casing",
      "past",
      "past-casing",
      "future",
      "future-casing",
    ].every((kind) => Boolean(map.getLayer(routeLayerId(key, kind)))) &&
    Boolean(map.getLayer(cometSourceId(key)))
  );
}

function staticRouteFeatures(
  indexedTrack: IndexedMapTrack,
): MapGeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: indexedTrack.index.segments.flatMap((segment, segmentIndex) =>
      segment.coordinates.length < 2
        ? []
        : [
            {
              id: segmentIndex,
              type: "Feature" as const,
              geometry: {
                type: "LineString" as const,
                coordinates: segment.coordinates,
              },
              properties: {
                segmentIndex,
                stream: indexedTrack.track.stream,
              },
            },
          ],
    ),
  };
}

/** Produces the route's past/future line-gradient expression. */
export function activeRouteGradient(
  pastColor: string,
  pastOpacity: number,
  futureColor: string,
  futureOpacity: number,
  progress: number,
): readonly unknown[] {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  return [
    "step",
    ["line-progress"],
    hexColorWithAlpha(pastColor, pastOpacity),
    clampedProgress,
    hexColorWithAlpha(futureColor, futureOpacity),
  ];
}

/** Wraps one line in the GeoJSON source shape expected by MapLibre. */
export function lineFeatureCollection(
  coordinates: readonly [number, number][],
): MapGeoJsonFeatureCollection {
  if (coordinates.length < 2) return EMPTY_MAP_FEATURE_COLLECTION;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {},
      },
    ],
  };
}

/** Updates one GeoJSON source if it is currently installed. */
export function setGeoJsonSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: MapGeoJsonFeatureCollection,
): void {
  const source = map.getSource(sourceId);
  if (
    typeof (source as { setData?: unknown } | undefined)?.setData === "function"
  ) {
    noteMapSourceUpdate(sourceId);
    (
      source as unknown as {
        setData: (next: MapGeoJsonFeatureCollection) => void;
      }
    ).setData(data);
  }
}

/** Shared route and comet styling constants used by static and live paint. */
export const MAP_ROUTE_PAINT = {
  casingColor: ROUTE_CASING_COLOR,
  casingWidth: ROUTE_CASING_WIDTH,
  cometTrailNs: 15_000_000_000n,
  cometWidth: COMET_WIDTH,
  futureColor: FUTURE_ROUTE_COLOR,
  pastOpacity: ROUTE_PAST_OPACITY,
  routeWidth: ROUTE_COLOR_WIDTH,
} as const;
