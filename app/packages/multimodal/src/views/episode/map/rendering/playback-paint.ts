import {
  createLocationTrackCursor,
  indexedLocationTrailCoordinates,
  resolveIndexedLocationAtTime,
  type IndexedLocationTrack,
  type InterpolatedLocation,
  type LocationTrackCursor,
  type ResolvedLocationTrackPosition,
} from "../tracks/location-track";
import { mapRouteProgressFilters } from "../tracks/route-progress";
import { degreesToRadians } from "../wgs84";
import { CURRENT_SOURCE_ID, PULSE_LAYER_ID } from "./map-sources";
import { puckImageId, PUCK_VARIANT } from "./puck";
import {
  activeRouteGradient,
  cometSourceId,
  lineFeatureCollection,
  MAP_ROUTE_PAINT,
  routeLayerId,
  setGeoJsonSourceData,
  type IndexedMapTrack,
  type MapGeoJsonFeatureCollection,
} from "./route-layers";

type MapLibreMap = import("maplibre-gl").Map;

const METERS_PER_PIXEL_ZOOM_0 = 40075016.686 / 512;
const PULSE_PERIOD_MS = 1_600;

/** One stream's interpolated marker at the current playback time. */
export interface MapLocationMarker {
  readonly color: string;
  readonly label: string;
  readonly location: InterpolatedLocation;
  readonly stream: string;
}

/** Recent route coordinates painted behind one playback marker. */
export interface CometTrail {
  readonly color: string;
  readonly coordinates: readonly [number, number][];
  readonly key: string;
}

/** Immutable map presentation resolved for one playback timestamp. */
export interface MapPlaybackFrame {
  readonly comets: readonly CometTrail[];
  readonly markers: readonly MapLocationMarker[];
  readonly resolutions: ReadonlyMap<string, ResolvedLocationTrackPosition>;
}

/** Mutable cursors and filter keys retained between map paint frames. */
export interface MapPlaybackPaintState {
  readonly cursors: Map<string, LocationTrackCursor>;
  readonly routeProgressKeys: Map<string, string>;
}

/** Creates an empty map frame for startup and cleared playback. */
export function emptyMapPlaybackFrame(): MapPlaybackFrame {
  return { comets: [], markers: [], resolutions: new Map() };
}

/**
 * Replaces route-derived markers with exact current-frame observations and
 * adds streams whose full route has not produced a marker yet.
 */
export function withLiveMapMarkers(
  frame: MapPlaybackFrame,
  liveMarkers: readonly MapLocationMarker[],
): MapPlaybackFrame {
  if (liveMarkers.length === 0) return frame;
  const liveByStream = new Map(
    liveMarkers.map((marker) => [marker.stream, marker] as const),
  );
  const markers = frame.markers.map(
    (marker) => liveByStream.get(marker.stream) ?? marker,
  );
  const existingStreams = new Set(frame.markers.map((marker) => marker.stream));
  for (const marker of liveMarkers) {
    if (!existingStreams.has(marker.stream)) markers.push(marker);
  }
  return { ...frame, markers };
}

/** Resolves marker and comet presentation for one playback timestamp. */
export function mapPlaybackFrameAt(
  tracks: readonly IndexedMapTrack[],
  playheadNs: bigint | null,
  cursors: Map<string, LocationTrackCursor>,
): MapPlaybackFrame {
  const markers: MapLocationMarker[] = [];
  const comets: CometTrail[] = [];
  const resolutions = new Map<string, ResolvedLocationTrackPosition>();
  for (const indexedTrack of tracks) {
    const cursor = cursors.get(indexedTrack.key) ?? createLocationTrackCursor();
    cursors.set(indexedTrack.key, cursor);
    const resolved =
      playheadNs === null
        ? unresolvedRoutePosition(indexedTrack.index)
        : resolveIndexedLocationAtTime(indexedTrack.index, playheadNs, cursor);
    resolutions.set(indexedTrack.key, resolved);
    if (resolved.location) {
      markers.push({
        color: indexedTrack.track.color,
        label: indexedTrack.track.label,
        location: resolved.location,
        stream: indexedTrack.track.stream,
      });
    }
    comets.push({
      color: indexedTrack.track.color,
      coordinates:
        playheadNs === null
          ? []
          : indexedLocationTrailCoordinates(
              indexedTrack.index,
              resolved,
              MAP_ROUTE_PAINT.cometTrailNs,
            ),
      key: indexedTrack.key,
    });
  }
  return { comets, markers, resolutions };
}

/** Resolves lightweight markers for hover-time painting. */
export function indexedTrackMarkersAt(
  tracks: readonly IndexedMapTrack[],
  timeNs: bigint | null,
): readonly MapLocationMarker[] {
  if (timeNs === null) return [];
  const markers: MapLocationMarker[] = [];
  for (const { index, track } of tracks) {
    const location = resolveIndexedLocationAtTime(index, timeNs).location;
    if (location) {
      markers.push({
        color: track.color,
        label: track.label,
        location,
        stream: track.stream,
      });
    }
  }
  return markers;
}

/** Paints the mutable current puck, comet, and route progress sources. */
export function paintMapPlaybackFrame(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
  frame: MapPlaybackFrame,
  paintState: MapPlaybackPaintState,
): void {
  setGeoJsonSourceData(
    map,
    CURRENT_SOURCE_ID,
    currentPuckFeatures(frame.markers),
  );
  for (let index = 0; index < tracks.length; index += 1) {
    const indexedTrack = tracks[index];
    const comet = frame.comets[index];
    setGeoJsonSourceData(
      map,
      cometSourceId(indexedTrack.key),
      lineFeatureCollection(comet?.coordinates ?? []),
    );
    const resolved = frame.resolutions.get(indexedTrack.key);
    if (resolved) updateRouteProgress(map, indexedTrack, resolved, paintState);
  }
}

/** Drops cursor/filter state for tracks that no longer exist. */
export function prunePlaybackPaintState(
  state: MapPlaybackPaintState,
  tracks: readonly IndexedMapTrack[],
): void {
  const wanted = new Set(tracks.map((track) => track.key));
  for (const key of state.cursors.keys()) {
    if (!wanted.has(key)) state.cursors.delete(key);
  }
  for (const key of state.routeProgressKeys.keys()) {
    if (!wanted.has(key)) state.routeProgressKeys.delete(key);
  }
}

/** Converts markers into the generic point collection used for hover. */
export function mapMarkerFeatures(
  markers: readonly MapLocationMarker[],
): MapGeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [marker.location.longitude, marker.location.latitude],
      },
      properties: {
        color: marker.color,
        label: marker.label,
        stream: marker.stream,
      },
    })),
  };
}

/** Paints or clears the current-location pulse for one controller tick. */
export function updateMapPulse(
  map: MapLibreMap,
  pulseActive: boolean,
  nowMs: number,
): void {
  if (!map.getLayer(PULSE_LAYER_ID)) return;
  if (!pulseActive) {
    map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0);
    return;
  }
  const phase = (nowMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  map.setPaintProperty(PULSE_LAYER_ID, "circle-radius", 10 + phase * 16);
  map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0.4 * (1 - phase));
}

function unresolvedRoutePosition(
  track: IndexedLocationTrack,
): ResolvedLocationTrackPosition {
  return {
    boundarySegmentIndex: 0,
    lineProgress: null,
    location: null,
    pointIndex: null,
    segmentIndex: null,
    state: track.segments.length === 0 ? "empty" : "before",
  };
}

function updateRouteProgress(
  map: MapLibreMap,
  indexedTrack: IndexedMapTrack,
  resolved: ResolvedLocationTrackPosition,
  paintState: MapPlaybackPaintState,
): void {
  const { key, track } = indexedTrack;
  if (!map.getLayer(routeLayerId(key, "active"))) return;
  const filters = mapRouteProgressFilters(resolved);
  if (paintState.routeProgressKeys.get(key) !== filters.key) {
    map.setFilter(routeLayerId(key, "past-casing"), filters.past as never);
    map.setFilter(routeLayerId(key, "past"), filters.past as never);
    map.setFilter(routeLayerId(key, "future-casing"), filters.future as never);
    map.setFilter(routeLayerId(key, "future"), filters.future as never);
    map.setFilter(routeLayerId(key, "active-casing"), filters.active as never);
    map.setFilter(routeLayerId(key, "active"), filters.active as never);
    paintState.routeProgressKeys.set(key, filters.key);
  }
  if (resolved.segmentIndex !== null && resolved.lineProgress !== null) {
    map.setPaintProperty(
      routeLayerId(key, "active-casing"),
      "line-gradient",
      activeRouteGradient(
        MAP_ROUTE_PAINT.casingColor,
        0.85,
        MAP_ROUTE_PAINT.casingColor,
        0.55,
        resolved.lineProgress,
      ) as never,
    );
    map.setPaintProperty(
      routeLayerId(key, "active"),
      "line-gradient",
      activeRouteGradient(
        track.color,
        0.5,
        MAP_ROUTE_PAINT.futureColor,
        0.3,
        resolved.lineProgress,
      ) as never,
    );
  }
}

function currentPuckFeatures(
  markers: readonly MapLocationMarker[],
): MapGeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => {
      const bearing = marker.location.bearingDeg;
      return {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [marker.location.longitude, marker.location.latitude],
        },
        properties: {
          ...(marker.location.accuracyM !== undefined
            ? {
                accuracyPx0: accuracyPixelsAtZoom0(
                  marker.location.accuracyM,
                  marker.location.latitude,
                ),
              }
            : {}),
          bearing: bearing ?? 0,
          color: marker.color,
          icon: puckImageId(
            bearing === undefined ? PUCK_VARIANT.DOT : PUCK_VARIANT.NAV,
            marker.color,
          ),
          label: marker.label,
          stream: marker.stream,
        },
      };
    }),
  };
}

function accuracyPixelsAtZoom0(meters: number, latitude: number): number {
  const groundResolution =
    METERS_PER_PIXEL_ZOOM_0 * Math.cos(degreesToRadians(latitude));
  return meters / Math.max(groundResolution, 1e-6);
}
