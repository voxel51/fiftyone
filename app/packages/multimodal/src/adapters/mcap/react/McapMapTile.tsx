import {
  getHoverTime,
  getPlayhead,
  setHoverTime,
  subscribeHoverTime,
  subscribePlayhead,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MeasureRulerIcon from "../../../components/MeasureRulerIcon";
import { useSceneInventory } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { useMcapLocationTracksContext } from "./mcap-location-tracks-context";
import {
  combineLocationBounds,
  interpolateLocationAtTime,
  locationBounds,
  locationTrailCoordinates,
  type InterpolatedLocation,
  type LocationBounds,
  type McapLocationTrackSegment,
  type McapLocationTrackState,
} from "./mcap-location-track";
import {
  ensurePuckImages,
  hexColorWithAlpha,
  puckImageId,
  PUCK_VARIANT,
} from "./mcap-map-puck";
import {
  formatMapMeasurementDistance,
  mapMeasurementDistance,
  nextMapMeasurementState,
  type MapMeasurementPoint,
  type MapMeasurementState,
} from "./mcap-map-measurement";
import {
  MCAP_MAP_BASE_LAYER,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  type McapMapBaseLayer,
  useMcapMapTileSettings,
  useSetMcapMapTileSettings,
} from "./mcap-map-tile-state";
import { useMcapDataStream } from "./mcap-data-stream-context";
import type { McapTileProps } from "./mcap-tile-types";
import { degreesToRadians } from "./wgs84";
import McapMapTileSettings from "./McapMapTileSettings";
import styles from "./McapMapTile.module.css";

const ROUTE_PAST_SOURCE_ID = "mcap-location-route-past";
const ROUTE_FUTURE_SOURCE_ID = "mcap-location-route-future";
const HIT_SOURCE_ID = "mcap-location-hit-points";
const CURRENT_SOURCE_ID = "mcap-location-current";
const HOVER_SOURCE_ID = "mcap-location-hover";
const MEASURE_LINE_SOURCE_ID = "mcap-location-measure-line";
const MEASURE_PREVIEW_SOURCE_ID = "mcap-location-measure-preview";
const MEASURE_POINTS_SOURCE_ID = "mcap-location-measure-points";

const ROUTE_PAST_LAYER_ID = "mcap-location-route-past";
const ROUTE_PAST_CASING_LAYER_ID = "mcap-location-route-past-casing";
const ROUTE_FUTURE_LAYER_ID = "mcap-location-route-future";
const ROUTE_FUTURE_CASING_LAYER_ID = "mcap-location-route-future-casing";
const HIT_LAYER_ID = "mcap-location-hit-points";
const ACCURACY_LAYER_ID = "mcap-location-accuracy";
const PULSE_LAYER_ID = "mcap-location-pulse";
const PUCK_LAYER_ID = "mcap-location-puck";
const HOVER_LAYER_ID = "mcap-location-hover";
const MEASURE_LINE_LAYER_ID = "mcap-location-measure-line";
const MEASURE_PREVIEW_LAYER_ID = "mcap-location-measure-preview";
const MEASURE_POINTS_LAYER_ID = "mcap-location-measure-points";

// Comet-trail sources/layers are per track (line-gradient cannot read
// feature properties); the color is baked into the id so a palette change
// recreates the layer.
const COMET_ID_PREFIX = "mcap-location-comet:";
const COMET_TRAIL_NS = 15_000_000_000n;

const PULSE_PERIOD_MS = 1_600;
// Recenter zooms to the recent trail when one exists; otherwise this
// street-scale zoom around the marker.
const RECENTER_MARKER_ZOOM = 16;
// While the recenter animation runs, the follow easeTo must stand down or
// it freezes the zoom mid-flight (easeTo without zoom keeps current zoom).
const RECENTER_GUARD_MS = 600;
const FUTURE_ROUTE_COLOR = "#8b98a9";
// Dark casing under every route line so the colored strokes hold contrast
// on light basemaps as well as the dark no-tile canvas.
const ROUTE_CASING_COLOR = "#0b1220";
const MEASURE_COLOR = "#22d3ee";
// Tail alpha of the comet gradient; > 0 keeps the fade gentle rather than
// a hard laser taper.
const COMET_TAIL_ALPHA = 0.35;

// Web-mercator ground resolution at zoom 0 on the equator (512px world):
// 40075016.686m / 512. The accuracy ring stores its radius as
// pixels-at-zoom-0 so a base-2 zoom interpolation renders a true metric
// circle at every zoom.
const METERS_PER_PIXEL_ZOOM_0 = 40075016.686 / 512;
const MAX_STYLE_ZOOM = 22;

// Type-only imports are erased at compile time, so they do not defeat the
// dynamic import that keeps maplibre-gl out of the main bundle.
type MapLibreModule = typeof import("maplibre-gl");
type MapLibreMap = import("maplibre-gl").Map;
type MapLibreStyle = import("maplibre-gl").StyleSpecification;

interface MapLayerFeatureEvent {
  readonly features?: readonly {
    readonly properties?: Record<string, unknown>;
  }[];
}

interface MapPointerEvent {
  readonly lngLat?: {
    readonly lat: number;
    readonly lng: number;
  };
}

interface GeoJsonFeature {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "LineString" | "Point";
    readonly coordinates: readonly unknown[];
  };
  readonly properties: Record<string, string | number | boolean | undefined>;
}

interface GeoJsonFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly GeoJsonFeature[];
}

let mapLibreImport: Promise<MapLibreModule> | null = null;
let mapLibreCssImport: Promise<void> | null = null;

const EMPTY_FEATURE_COLLECTION: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const NO_TILE_STYLE: MapLibreStyle = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "mcap-location-background",
      type: "background",
      paint: { "background-color": "#06101a" },
    },
  ],
};

const McapMapTile: React.FC<McapTileProps> = () => {
  const setTileTitle = useSetTileTitle();
  const sources = useSceneInventory();
  const tracksByTopic = useMcapLocationTracksContext();
  const settings = useMcapMapTileSettings();
  const setSettings = useSetMcapMapTileSettings();
  const dataStream = useMcapDataStream();
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const isPlaying = useIsPlaying();
  const [playheadSec, setPlayheadSec] = useState(() => getPlayhead(store));
  const [hoverSec, setHoverSec] = useState<number | null>(() =>
    getHoverTime(store),
  );
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [measureArmed, setMeasureArmed] = useState(false);
  const [measurement, setMeasurement] = useState<MapMeasurementState | null>(
    null,
  );

  const locationSources = useMemo(
    () => sources.filter((source) => source.type === MCAP_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const allTopics = useMemo(
    () => locationSources.map((source) => source.id),
    [locationSources],
  );
  const enabledTopics = useMemo(
    () => new Set(settings.enabledTopics ?? allTopics),
    [allTopics, settings.enabledTopics],
  );
  const visibleTopics = useMemo(
    () => allTopics.filter((topic) => enabledTopics.has(topic)),
    [allTopics, enabledTopics],
  );
  const tracks = useMemo(
    () =>
      visibleTopics
        .map((topic) => tracksByTopic.get(topic))
        .filter((track): track is McapLocationTrackState => Boolean(track)),
    [tracksByTopic, visibleTopics],
  );
  const readyTracks = useMemo(
    () =>
      tracks.filter(
        (track) => track.status === "ready" && track.segments.length > 0,
      ),
    [tracks],
  );

  useEffect(() => {
    setTileTitle(mapTileTitle(readyTracks, locationSources.length), {
      source: "auto",
    });
  }, [locationSources.length, readyTracks, setTileTitle]);

  useEffect(() => {
    const unsubscribePlayhead = subscribePlayhead(store, () => {
      setPlayheadSec(getPlayhead(store));
    });
    const unsubscribeHover = subscribeHoverTime(store, () => {
      setHoverSec(getHoverTime(store));
    });
    setPlayheadSec(getPlayhead(store));
    setHoverSec(getHoverTime(store));
    return () => {
      unsubscribePlayhead();
      unsubscribeHover();
      setHoverTime(store, null);
    };
  }, [store]);

  const playheadNs = useMemo(
    () => (timeline ? timeline.secToNs(playheadSec) : null),
    [playheadSec, timeline],
  );
  const hoverNs = useMemo(
    () => (timeline && hoverSec !== null ? timeline.secToNs(hoverSec) : null),
    [hoverSec, timeline],
  );
  const bounds = useMemo(
    () =>
      combineLocationBounds(
        readyTracks.map((track) => locationBounds(track.segments)),
      ),
    [readyTracks],
  );
  const currentLocations = useMemo(
    () => trackMarkersAt(readyTracks, playheadNs),
    [playheadNs, readyTracks],
  );
  const hoverLocations = useMemo(
    () => trackMarkersAt(readyTracks, hoverNs),
    [hoverNs, readyTracks],
  );

  const onSeekTimeNs = useCallback(
    (timeNs: bigint) => {
      if (!timeline) return;
      seek(timeline.nsToSec(timeNs));
    },
    [seek, timeline],
  );
  const onHoverTimeNs = useCallback(
    (timeNs: bigint | null) => {
      setHoverTime(
        store,
        timeNs !== null && timeline ? timeline.nsToSec(timeNs) : null,
      );
    },
    [store, timeline],
  );
  const onMeasurePick = useCallback((point: MapMeasurementPoint) => {
    setMeasurement((current) => nextMapMeasurementState(current, point));
  }, []);
  const onMeasureToggle = useCallback(() => {
    setMeasureArmed((armed) => {
      if (armed) setMeasurement(null);
      return !armed;
    });
  }, []);

  useEffect(() => {
    if (!measureArmed) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (measurement) {
        setMeasurement(null);
      } else {
        setMeasureArmed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [measureArmed, measurement]);

  const measuredDistance = mapMeasurementDistance(measurement);
  const measureReadout = !measureArmed
    ? null
    : measuredDistance !== null
      ? formatMapMeasurementDistance(measuredDistance)
      : measurement
        ? "Pick the second map point"
        : "Pick two map points";

  const loadingCount = tracks.filter(
    (track) => track.status === "loading",
  ).length;
  const errorCount = tracks.filter((track) => track.status === "error").length;
  const truncated = tracks.some((track) => track.truncated);
  const statusText = mapStatusText({
    enabledTopicCount: visibleTopics.length,
    errorCount,
    loadingCount,
    locationTopicCount: locationSources.length,
    readyTrackCount: readyTracks.length,
    truncated,
  });

  return (
    <>
      <McapMapTileSettings />
      <div className={styles.body} data-testid="mcap-map-tile">
        <McapMapLibreSurface
          bounds={bounds}
          currentLocations={currentLocations}
          followEgo={settings.followEgo}
          hoverLocations={hoverLocations}
          measureArmed={measureArmed}
          measurement={measurement}
          onHoverTimeNs={onHoverTimeNs}
          onMeasurePick={onMeasurePick}
          onSeekTimeNs={onSeekTimeNs}
          onUserMove={() => setSettings({ followEgo: false })}
          playheadNs={playheadNs}
          pulseActive={isPlaying}
          recenterNonce={recenterNonce}
          baseLayer={settings.baseLayer}
          tracks={readyTracks}
        />
        <div className={styles.overlay}>
          {statusText ? (
            <span className={styles.statusBadge}>{statusText}</span>
          ) : null}
          {!settings.followEgo && readyTracks.length > 0 ? (
            <button
              className={styles.controlButton}
              onClick={() => {
                setSettings({ followEgo: true });
                setRecenterNonce((value) => value + 1);
              }}
              type="button"
            >
              Recenter
            </button>
          ) : null}
        </div>
        {readyTracks.length > 0 ? (
          <div className={styles.toolOverlay}>
            <button
              aria-label="Measure distance"
              aria-pressed={measureArmed}
              className={
                measureArmed
                  ? styles.iconControlButtonActive
                  : styles.iconControlButton
              }
              onClick={onMeasureToggle}
              title="Measure distance on the map (Esc clears)"
              type="button"
            >
              <MeasureRulerIcon />
            </button>
            {measureReadout ? (
              <div className={styles.measureReadout}>{measureReadout}</div>
            ) : null}
          </div>
        ) : null}
        {readyTracks.length > 0 ? <MapLegend tracks={readyTracks} /> : null}
        {emptyText({
          enabledTopicCount: visibleTopics.length,
          locationTopicCount: locationSources.length,
          loadingCount,
          readyTrackCount: readyTracks.length,
        })}
      </div>
    </>
  );
};

function McapMapLibreSurface({
  baseLayer,
  bounds,
  currentLocations,
  followEgo,
  hoverLocations,
  measureArmed,
  measurement,
  onHoverTimeNs,
  onMeasurePick,
  onSeekTimeNs,
  onUserMove,
  playheadNs,
  pulseActive,
  recenterNonce,
  tracks,
}: {
  readonly baseLayer: McapMapBaseLayer;
  readonly bounds: LocationBounds | null;
  readonly currentLocations: readonly MapLocationMarker[];
  readonly followEgo: boolean;
  readonly hoverLocations: readonly MapLocationMarker[];
  readonly measureArmed: boolean;
  readonly measurement: MapMeasurementState | null;
  readonly onHoverTimeNs: (timeNs: bigint | null) => void;
  readonly onMeasurePick: (point: MapMeasurementPoint) => void;
  readonly onSeekTimeNs: (timeNs: bigint) => void;
  readonly onUserMove: () => void;
  readonly playheadNs: bigint | null;
  readonly pulseActive: boolean;
  readonly recenterNonce: number;
  readonly tracks: readonly McapLocationTrackState[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fitKeyRef = useRef<string | null>(null);
  const recenterGuardUntilRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [measurementHover, setMeasurementHover] =
    useState<MapMeasurementPoint | null>(null);
  const onSeekTimeNsRef = useRef(onSeekTimeNs);
  const onHoverTimeNsRef = useRef(onHoverTimeNs);
  const onMeasurePickRef = useRef(onMeasurePick);
  const onUserMoveRef = useRef(onUserMove);
  const measureArmedRef = useRef(measureArmed);
  const measurementRef = useRef(measurement);
  onSeekTimeNsRef.current = onSeekTimeNs;
  onHoverTimeNsRef.current = onHoverTimeNs;
  onMeasurePickRef.current = onMeasurePick;
  onUserMoveRef.current = onUserMove;
  measureArmedRef.current = measureArmed;
  measurementRef.current = measurement;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || failed) {
      return undefined;
    }
    setLoaded(false);
    loadedRef.current = false;
    fitKeyRef.current = null;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          attributionControl: false,
          center: [0, 0],
          container: containerRef.current,
          interactive: true,
          pitchWithRotate: false,
          style: mapStyleForBaseLayer(baseLayer),
          zoom: 1,
        });
        mapRef.current = map;
        map.addControl(
          new maplibregl.NavigationControl({
            showCompass: false,
            showZoom: true,
          }),
          "top-right",
        );

        map.on("load", () => {
          loadedRef.current = true;
          addMcapMapSourcesAndLayers(map);
          setLoaded(true);
        });
        map.on("error", () => {
          if (!loadedRef.current) {
            setFailed(true);
          }
        });
        const handleUserMove = (event: { originalEvent?: unknown }) => {
          if (event.originalEvent) {
            onUserMoveRef.current();
          }
        };
        map.on("dragstart", handleUserMove);
        map.on("zoomstart", handleUserMove);
        map.on("rotatestart", handleUserMove);
        map.on("pitchstart", handleUserMove);
        map.on("click", HIT_LAYER_ID, (event) => {
          if (measureArmedRef.current) return;
          const timeNs = timeNsFromMapEvent(event);
          if (timeNs !== null) {
            onSeekTimeNsRef.current(timeNs);
          }
        });
        map.on("mousemove", HIT_LAYER_ID, (event) => {
          if (measureArmedRef.current) return;
          map.getCanvas().style.cursor = "pointer";
          onHoverTimeNsRef.current(timeNsFromMapEvent(event));
        });
        map.on("mouseleave", HIT_LAYER_ID, () => {
          if (measureArmedRef.current) return;
          map.getCanvas().style.cursor = "";
          onHoverTimeNsRef.current(null);
        });
        map.on("click", (event) => {
          if (!measureArmedRef.current) return;
          const point = measurementPointFromMapEvent(event);
          if (point) onMeasurePickRef.current(point);
        });
        map.on("mousemove", (event) => {
          if (!measureArmedRef.current) return;
          const current = measurementRef.current;
          if (!current || current.b) {
            setMeasurementHover(null);
            return;
          }
          setMeasurementHover(measurementPointFromMapEvent(event));
        });
        // "mouseleave" only exists as a layer-scoped event; the map-level
        // pointer-exit event is "mouseout".
        map.on("mouseout", () => {
          setMeasurementHover(null);
        });
        map.getCanvas().addEventListener("webglcontextlost", () => {
          setFailed(true);
        });

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => map.resize());
          resizeObserver.observe(containerRef.current);
        }
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
      loadedRef.current = false;
    };
  }, [baseLayer, failed]);

  useEffect(() => {
    setFailed(false);
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = measureArmed ? "crosshair" : "";
    if (!measureArmed) {
      setMeasurementHover(null);
    }
  }, [measureArmed, loaded]);

  const sourceData = useMemo(
    () => ({
      comets: cometTrails(tracks, playheadNs),
      current: currentPuckFeatures(currentLocations),
      future: routeFeatures(tracks, playheadNs, "future"),
      hit: hitPointFeatures(tracks),
      hover: markerFeatures(hoverLocations),
      measureLine: measurementLineFeature(measurement),
      measurePoints: measurementPointFeatures(measurement),
      measurePreview: measurementPreviewFeature(measurement, measurementHover),
      past: routeFeatures(tracks, playheadNs, "past"),
      trackColors: tracks.map((track) => track.color),
    }),
    [
      currentLocations,
      hoverLocations,
      measurement,
      measurementHover,
      playheadNs,
      tracks,
    ],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      return;
    }
    ensurePuckImages(map, sourceData.trackColors);
    syncCometLayers(map, sourceData.comets);
    setGeoJsonSourceData(map, ROUTE_PAST_SOURCE_ID, sourceData.past);
    setGeoJsonSourceData(map, ROUTE_FUTURE_SOURCE_ID, sourceData.future);
    setGeoJsonSourceData(map, HIT_SOURCE_ID, sourceData.hit);
    setGeoJsonSourceData(map, CURRENT_SOURCE_ID, sourceData.current);
    setGeoJsonSourceData(map, HOVER_SOURCE_ID, sourceData.hover);
    setGeoJsonSourceData(map, MEASURE_LINE_SOURCE_ID, sourceData.measureLine);
    setGeoJsonSourceData(
      map,
      MEASURE_PREVIEW_SOURCE_ID,
      sourceData.measurePreview,
    );
    setGeoJsonSourceData(
      map,
      MEASURE_POINTS_SOURCE_ID,
      sourceData.measurePoints,
    );
  }, [sourceData, loaded]);

  // Sonar pulse under the puck while playing: the marker doubles as the
  // playback-state indicator. rAF-driven paint updates on one tiny layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer(PULSE_LAYER_ID)) {
      return undefined;
    }
    if (!pulseActive) {
      map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0);
      return undefined;
    }
    let frame = 0;
    const tick = (now: number) => {
      const phase = (now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      map.setPaintProperty(PULSE_LAYER_ID, "circle-radius", 10 + phase * 16);
      map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0.4 * (1 - phase));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      // Skip the reset when this cleanup races a map teardown.
      if (mapRef.current === map && map.getLayer(PULSE_LAYER_ID)) {
        map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0);
      }
    };
  }, [pulseActive, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !bounds) {
      return;
    }
    const fitKey = `${bounds.west}:${bounds.south}:${bounds.east}:${bounds.north}`;
    if (fitKeyRef.current === fitKey) {
      return;
    }
    fitKeyRef.current = fitKey;
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { duration: 240, maxZoom: 17, padding: 42 },
    );
  }, [bounds, loaded]);

  // Recenter: re-frame around "now" — fit the recent trail when one
  // exists (adaptive zoom: a fast vehicle gets a wider view), else ease to
  // the marker at street zoom, else fall back to the whole track.
  useEffect(() => {
    const map = mapRef.current;
    if (recenterNonce === 0 || !map || !loadedRef.current) {
      return;
    }
    recenterGuardUntilRef.current = performance.now() + RECENTER_GUARD_MS;
    const trailBounds = coordinateBounds(
      sourceData.comets.flatMap((trail) => trail.coordinates),
    );
    const marker = currentLocations[0]?.location;
    if (trailBounds) {
      map.fitBounds(
        [
          [trailBounds.west, trailBounds.south],
          [trailBounds.east, trailBounds.north],
        ],
        { duration: 400, maxZoom: 17, padding: 80 },
      );
    } else if (marker) {
      map.easeTo({
        center: [marker.longitude, marker.latitude],
        duration: 400,
        zoom: RECENTER_MARKER_ZOOM,
      });
    } else if (bounds) {
      map.fitBounds(
        [
          [bounds.west, bounds.south],
          [bounds.east, bounds.north],
        ],
        { duration: 400, maxZoom: 17, padding: 42 },
      );
    }
    // Latest-closure effect: only the nonce (and load state) may trigger
    // it — depending on trail/marker would re-run the camera move every
    // playhead tick — but React runs the freshest closure, so the values
    // read here are current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterNonce, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    const current = currentLocations[0]?.location;
    if (!map || !loadedRef.current || !followEgo || !current) {
      return;
    }
    if (performance.now() < recenterGuardUntilRef.current) {
      return;
    }
    map.easeTo({
      center: [current.longitude, current.latitude],
      duration: 120,
      essential: false,
    });
  }, [currentLocations, followEgo, loaded]);

  return (
    <>
      <div className={styles.map} ref={containerRef} />
      {failed || !loaded ? (
        <div className={styles.fallback}>
          <StaticLocationMap tracks={tracks} />
        </div>
      ) : null}
    </>
  );
}

interface MapLocationMarker {
  readonly color: string;
  readonly label: string;
  readonly location: InterpolatedLocation;
  readonly topic: string;
}

function trackMarkersAt(
  tracks: readonly McapLocationTrackState[],
  timeNs: bigint | null,
): readonly MapLocationMarker[] {
  if (timeNs === null) return [];
  const markers: MapLocationMarker[] = [];
  for (const track of tracks) {
    const location = interpolateLocationAtTime(track.segments, timeNs);
    if (location) {
      markers.push({
        color: track.color,
        label: track.label,
        location,
        topic: track.topic,
      });
    }
  }
  return markers;
}

function MapLegend({
  tracks,
}: {
  readonly tracks: readonly McapLocationTrackState[];
}) {
  return (
    <div className={styles.legend}>
      {tracks.map((track) => (
        <div className={styles.legendRow} key={track.topic} title={track.topic}>
          <span
            className={styles.legendSwatch}
            style={{ backgroundColor: track.color }}
          />
          <span className={styles.legendLabel}>{track.label}</span>
          <span className={styles.legendMeta}>
            {track.pointCount.toLocaleString()}
            {track.truncated ? " sampled" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function StaticLocationMap({
  tracks,
}: {
  readonly tracks: readonly McapLocationTrackState[];
}) {
  const bounds = combineLocationBounds(
    tracks.map((track) => locationBounds(track.segments)),
  );
  const project = useCallback(
    (longitude: number, latitude: number): [number, number] => {
      if (!bounds) return [50, 50];
      const width = Math.max(bounds.east - bounds.west, 0.000001);
      const height = Math.max(bounds.north - bounds.south, 0.000001);
      const x = ((longitude - bounds.west) / width) * 92 + 4;
      const y = 96 - ((latitude - bounds.south) / height) * 92;
      return [x, y];
    },
    [bounds],
  );

  return (
    <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
      <rect fill="#06101a" height="100" width="100" />
      {Array.from({ length: 6 }, (_, index) => (
        <React.Fragment key={index}>
          <line
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth="0.15"
            x1={index * 20}
            x2={index * 20}
            y1="0"
            y2="100"
          />
          <line
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth="0.15"
            x1="0"
            x2="100"
            y1={index * 20}
            y2={index * 20}
          />
        </React.Fragment>
      ))}
      {tracks.flatMap((track) =>
        track.segments.map((segment, segmentIndex) => {
          const points = segment.points
            .map((point) => project(point.longitude, point.latitude))
            .map(([x, y]) => `${x},${y}`)
            .join(" ");
          return (
            <polyline
              fill="none"
              key={`${track.topic}:${segmentIndex}`}
              points={points}
              stroke={track.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="0.7"
            />
          );
        }),
      )}
    </svg>
  );
}

function addMcapMapSourcesAndLayers(map: MapLibreMap) {
  addGeoJsonSource(map, ROUTE_PAST_SOURCE_ID);
  addGeoJsonSource(map, ROUTE_FUTURE_SOURCE_ID);
  addGeoJsonSource(map, HIT_SOURCE_ID);
  addGeoJsonSource(map, CURRENT_SOURCE_ID);
  addGeoJsonSource(map, HOVER_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_LINE_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_PREVIEW_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_POINTS_SOURCE_ID);

  map.addLayer({
    id: ROUTE_FUTURE_CASING_LAYER_ID,
    type: "line",
    source: ROUTE_FUTURE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ROUTE_CASING_COLOR,
      "line-opacity": 0.55,
      "line-width": 4.5,
    },
  });
  // Future route is deliberately colorless: track identity lives in the
  // traveled route, comet trail, puck, and legend.
  map.addLayer({
    id: ROUTE_FUTURE_LAYER_ID,
    type: "line",
    source: ROUTE_FUTURE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": FUTURE_ROUTE_COLOR,
      "line-opacity": 0.3,
      "line-width": 2.5,
    },
  });
  map.addLayer({
    id: ROUTE_PAST_CASING_LAYER_ID,
    type: "line",
    source: ROUTE_PAST_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ROUTE_CASING_COLOR,
      "line-opacity": 0.85,
      "line-width": 4.5,
    },
  });
  // Dim history base; the per-track comet-trail layers (inserted above
  // this, below the pulse) add the bright gradient head behind the puck.
  map.addLayer({
    id: ROUTE_PAST_LAYER_ID,
    type: "line",
    source: ROUTE_PAST_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": 0.5,
      "line-width": 2.5,
    },
  });
  // Accuracy ring: the receiver's own 2σ horizontal-error estimate as a
  // metric circle under the puck. Present only when the fix carried a
  // non-degenerate covariance — no estimate, no ring.
  map.addLayer({
    id: ACCURACY_LAYER_ID,
    type: "circle",
    source: CURRENT_SOURCE_ID,
    filter: ["has", "accuracyPx0"],
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0.12,
      "circle-pitch-alignment": "map",
      "circle-radius": [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0,
        ["get", "accuracyPx0"],
        MAX_STYLE_ZOOM,
        ["*", ["get", "accuracyPx0"], 2 ** MAX_STYLE_ZOOM],
      ],
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-opacity": 0.4,
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: PULSE_LAYER_ID,
    type: "circle",
    source: CURRENT_SOURCE_ID,
    paint: {
      "circle-color": ["get", "color"],
      "circle-opacity": 0,
      "circle-radius": 10,
    },
  });
  map.addLayer({
    id: HOVER_LAYER_ID,
    type: "circle",
    source: HOVER_SOURCE_ID,
    paint: {
      "circle-color": "#f8fafc",
      "circle-radius": 5,
      "circle-stroke-color": ["get", "color"],
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: MEASURE_PREVIEW_LAYER_ID,
    type: "line",
    source: MEASURE_PREVIEW_SOURCE_ID,
    paint: {
      "line-color": MEASURE_COLOR,
      "line-dasharray": [1.2, 1.2],
      "line-opacity": 0.9,
      "line-width": 2,
    },
  });
  map.addLayer({
    id: MEASURE_LINE_LAYER_ID,
    type: "line",
    source: MEASURE_LINE_SOURCE_ID,
    paint: {
      "line-color": MEASURE_COLOR,
      "line-opacity": 0.95,
      "line-width": 2.5,
    },
  });
  map.addLayer({
    id: MEASURE_POINTS_LAYER_ID,
    type: "circle",
    source: MEASURE_POINTS_SOURCE_ID,
    paint: {
      "circle-color": MEASURE_COLOR,
      "circle-radius": 4.5,
      "circle-stroke-color": "#06101a",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: HIT_LAYER_ID,
    type: "circle",
    source: HIT_SOURCE_ID,
    paint: {
      "circle-opacity": 0,
      "circle-radius": 8,
    },
  });
  map.addLayer({
    id: PUCK_LAYER_ID,
    type: "symbol",
    source: CURRENT_SOURCE_ID,
    layout: {
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-image": ["get", "icon"],
      "icon-rotate": ["get", "bearing"],
      "icon-rotation-alignment": "map",
    },
  });
}

interface CometTrail {
  readonly color: string;
  readonly coordinates: readonly [number, number][];
  readonly key: string;
}

function coordinateBounds(
  coordinates: readonly [number, number][],
): LocationBounds | null {
  if (coordinates.length === 0) {
    return null;
  }
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

function cometTrails(
  tracks: readonly McapLocationTrackState[],
  playheadNs: bigint | null,
): readonly CometTrail[] {
  if (playheadNs === null) {
    return [];
  }
  const trails: CometTrail[] = [];
  for (const track of tracks) {
    const coordinates = locationTrailCoordinates(
      track.segments,
      playheadNs,
      COMET_TRAIL_NS,
    );
    if (coordinates.length >= 2) {
      trails.push({
        color: track.color,
        coordinates,
        key: `${COMET_ID_PREFIX}${track.color}:${track.topic}`,
      });
    }
  }
  return trails;
}

/**
 * Reconciles one gradient line source+layer per comet trail. Layers are
 * per track because `line-gradient` cannot read feature properties; the
 * gradient runs transparent → track color toward the puck.
 */
function syncCometLayers(
  map: MapLibreMap,
  trails: readonly CometTrail[],
): void {
  const wanted = new Map(trails.map((trail) => [trail.key, trail]));
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(COMET_ID_PREFIX) && !wanted.has(layer.id)) {
      map.removeLayer(layer.id);
      map.removeSource(layer.id);
    }
  }
  for (const [id, trail] of wanted) {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION,
        lineMetrics: true,
      } as never);
      map.addLayer(
        {
          id,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-gradient": [
              "interpolate",
              ["linear"],
              ["line-progress"],
              0,
              hexColorWithAlpha(trail.color, COMET_TAIL_ALPHA),
              1,
              trail.color,
            ],
            // Same width as the base route so the trail reads as part of
            // the line rather than a bulge riding on top of it.
            "line-width": 2.5,
          },
        },
        PULSE_LAYER_ID,
      );
    }
    setGeoJsonSourceData(map, id, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: trail.coordinates },
          properties: {},
        },
      ],
    });
  }
}

function addGeoJsonSource(map: MapLibreMap, sourceId: string) {
  map.addSource(sourceId, {
    type: "geojson",
    data: EMPTY_FEATURE_COLLECTION,
  } as never);
}

function setGeoJsonSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJsonFeatureCollection,
) {
  const source = map.getSource(sourceId) as
    | { setData: (data: GeoJsonFeatureCollection) => void }
    | undefined;
  source?.setData(data);
}

function routeFeatures(
  tracks: readonly McapLocationTrackState[],
  playheadNs: bigint | null,
  side: "past" | "future",
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  for (const track of tracks) {
    for (const segment of track.segments) {
      const coordinates = routeCoordinatesForSegment(segment, playheadNs, side);
      if (coordinates.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          color: track.color,
          topic: track.topic,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function routeCoordinatesForSegment(
  segment: McapLocationTrackSegment,
  playheadNs: bigint | null,
  side: "past" | "future",
): readonly [number, number][] {
  if (playheadNs === null) {
    return side === "future"
      ? segment.points.map((point) => [point.longitude, point.latitude])
      : [];
  }

  const points =
    side === "past"
      ? segment.points.filter((point) => point.timeNs <= playheadNs)
      : segment.points.filter((point) => point.timeNs >= playheadNs);
  const interpolated = interpolateLocationAtTime([segment], playheadNs);
  if (interpolated) {
    if (side === "past") {
      points.push({
        latitude: interpolated.latitude,
        longitude: interpolated.longitude,
        timeNs: interpolated.timeNs,
      });
    } else {
      points.unshift({
        latitude: interpolated.latitude,
        longitude: interpolated.longitude,
        timeNs: interpolated.timeNs,
      });
    }
  }

  return points.map((point) => [point.longitude, point.latitude]);
}

function hitPointFeatures(
  tracks: readonly McapLocationTrackState[],
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
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
            topic: track.topic,
          },
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

function markerFeatures(
  markers: readonly MapLocationMarker[],
): GeoJsonFeatureCollection {
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
        topic: marker.topic,
      },
    })),
  };
}

/**
 * Current-position features carrying the sprite id and bearing for the
 * puck symbol layer. Stationary markers (no derivable bearing) fall back
 * to the unrotated dome variant.
 */
function currentPuckFeatures(
  markers: readonly MapLocationMarker[],
): GeoJsonFeatureCollection {
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
          topic: marker.topic,
        },
      };
    }),
  };
}

/**
 * A ground distance in meters as its pixel size at zoom 0, adjusted for
 * the mercator scale factor at the marker's latitude.
 */
function accuracyPixelsAtZoom0(meters: number, latitude: number): number {
  const groundResolution =
    METERS_PER_PIXEL_ZOOM_0 * Math.cos(degreesToRadians(latitude));
  return meters / Math.max(groundResolution, 1e-6);
}

function measurementLineFeature(
  measurement: MapMeasurementState | null,
): GeoJsonFeatureCollection {
  if (!measurement?.b) {
    return EMPTY_FEATURE_COLLECTION;
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
            [measurement.b.longitude, measurement.b.latitude],
          ],
        },
        properties: {},
      },
    ],
  };
}

function measurementPreviewFeature(
  measurement: MapMeasurementState | null,
  hover: MapMeasurementPoint | null,
): GeoJsonFeatureCollection {
  if (!measurement || measurement.b || !hover) {
    return EMPTY_FEATURE_COLLECTION;
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

function measurementPointFeatures(
  measurement: MapMeasurementState | null,
): GeoJsonFeatureCollection {
  if (!measurement) {
    return EMPTY_FEATURE_COLLECTION;
  }
  const points = [measurement.a, measurement.b].filter(
    (point): point is MapMeasurementPoint => point !== null,
  );
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
      properties: {},
    })),
  };
}

function timeNsFromMapEvent(event: MapLayerFeatureEvent): bigint | null {
  const value = event.features?.[0]?.properties?.timeNs;
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function measurementPointFromMapEvent(
  event: MapPointerEvent,
): MapMeasurementPoint | null {
  const lngLat = event.lngLat;
  if (!lngLat || !Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) {
    return null;
  }
  return { latitude: lngLat.lat, longitude: lngLat.lng };
}

function mapTileTitle(
  readyTracks: readonly McapLocationTrackState[],
  locationTopicCount: number,
): string {
  if (readyTracks.length === 1) {
    return readyTracks[0].label;
  }
  if (locationTopicCount > 1) {
    return `Map (${locationTopicCount})`;
  }
  return "Map";
}

function mapStatusText({
  enabledTopicCount,
  errorCount,
  loadingCount,
  locationTopicCount,
  readyTrackCount,
  truncated,
}: {
  readonly enabledTopicCount: number;
  readonly errorCount: number;
  readonly loadingCount: number;
  readonly locationTopicCount: number;
  readonly readyTrackCount: number;
  readonly truncated: boolean;
}): string | null {
  if (locationTopicCount === 0 || enabledTopicCount === 0) {
    return null;
  }
  const notes = [
    loadingCount > 0 ? `loading ${loadingCount}` : null,
    errorCount > 0 ? `${errorCount} failed` : null,
    readyTrackCount > 0 && truncated ? "downsampled" : null,
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(" · ") : null;
}

function emptyText({
  enabledTopicCount,
  loadingCount,
  locationTopicCount,
  readyTrackCount,
}: {
  readonly enabledTopicCount: number;
  readonly loadingCount: number;
  readonly locationTopicCount: number;
  readonly readyTrackCount: number;
}): React.ReactElement | null {
  let text: string | null = null;
  if (locationTopicCount === 0) {
    text = "No GPS topics in this recording";
  } else if (enabledTopicCount === 0) {
    text = "All GPS topics are hidden";
  } else if (readyTrackCount === 0 && loadingCount === 0) {
    text = "No valid GPS fixes to render";
  }
  return text ? <div className={styles.emptyState}>{text}</div> : null;
}

function mapStyleForBaseLayer(
  baseLayer: McapMapBaseLayer,
): MapLibreStyle | string {
  return baseLayer === MCAP_MAP_BASE_LAYER.NONE
    ? NO_TILE_STYLE
    : OPENFREEMAP_LIBERTY_STYLE_URL;
}

function loadMapLibre(): Promise<MapLibreModule> {
  if (!mapLibreImport) {
    mapLibreImport = Promise.all([
      import("maplibre-gl"),
      loadMapLibreStylesheet(),
    ]).then(([maplibregl]) => maplibregl);
  }
  return mapLibreImport;
}

function loadMapLibreStylesheet(): Promise<void> {
  if (!mapLibreCssImport) {
    mapLibreCssImport = import("maplibre-gl/dist/maplibre-gl.css?url").then(
      ({ default: href }) => {
        ensureMapLibreStylesheet(href);
      },
    );
  }
  return mapLibreCssImport;
}

function ensureMapLibreStylesheet(href: string) {
  if (typeof document === "undefined") {
    return;
  }
  const linkId = "fiftyone-maplibre-gl-css";
  if (document.getElementById(linkId)) {
    return;
  }
  const link = document.createElement("link");
  link.href = href;
  link.id = linkId;
  link.rel = "stylesheet";
  document.head.appendChild(link);
}

export default McapMapTile;
