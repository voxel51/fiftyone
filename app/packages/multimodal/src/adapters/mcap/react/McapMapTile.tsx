import {
  getHoverTime,
  getIsPlaying,
  getPlayhead,
  setHoverTime,
  subscribeHoverTime,
  subscribePlayhead,
  useIsPlaying,
  usePlayback,
  usePlaybackStore,
  type PlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
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
import {
  useMcapLocationTracksContext,
  useMcapLocationTracksSourceKey,
} from "./mcap-location-tracks-context";
import {
  combineLocationBounds,
  createLocationTrackCursor,
  indexedLocationTrailCoordinates,
  indexLocationTrack,
  locationBounds,
  resolveIndexedLocationAtTime,
  type IndexedLocationTrack,
  type InterpolatedLocation,
  type LocationTrackCursor,
  type LocationBounds,
  type McapLocationTrackState,
  type ResolvedLocationTrackPosition,
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
  mcapMapPlaybackCameraTarget,
  mcapMapRouteCameraTarget,
  type McapMapCameraTarget,
} from "./mcap-map-camera";
import {
  MCAP_MAP_BASE_LAYER,
  type McapMapBaseLayer,
  useMcapMapTileSettings,
  useSetMcapMapTileSettings,
} from "./mcap-map-tile-state";
import {
  initialMcapMapBasemapStatus,
  loadOpenFreeMapStyle,
  MCAP_MAP_LOCAL_BACKGROUND_LAYER_ID,
  mcapMapBasemapSourceIds,
  mcapMapBasemapStatusText,
  mergeMcapMapOverlaysIntoStyle,
  shouldShowMcapMapStaticPreview,
  type McapMapBasemapStatus,
} from "./mcap-map-basemap";
import {
  canPreserveMcapMapViewportBetweenSamples,
  readMcapMapViewport,
  useMcapMapViewportScope,
  writeMcapMapViewport,
} from "./mcap-map-viewport-cache";
import { mcapMapViewportIsNearEvidence } from "./mcap-map-viewport-proximity";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { McapMapPlaybackController } from "./mcap-map-playback-controller";
import {
  noteMcapMapFollowCommand,
  noteMcapMapPlaybackPaint,
  noteMcapMapReactCommit,
  noteMcapMapSourceUpdate,
} from "./mcap-map-performance";
import { mcapMapRouteProgressFilters } from "./mcap-map-route-progress";
import type { McapTimelineIndex } from "./mcap-timeline-index";
import type { McapTileProps } from "./mcap-tile-types";
import { degreesToRadians } from "./wgs84";
import McapMapTileSettings from "./McapMapTileSettings";
import { useRegisterMcapTileSettings } from "./mcap-tile-settings-context";
import styles from "./McapMapTile.module.css";

const HIT_SOURCE_ID = "mcap-location-hit-points";
const CURRENT_SOURCE_ID = "mcap-location-current";
const HOVER_SOURCE_ID = "mcap-location-hover";
const MEASURE_LINE_SOURCE_ID = "mcap-location-measure-line";
const MEASURE_PREVIEW_SOURCE_ID = "mcap-location-measure-preview";
const MEASURE_POINTS_SOURCE_ID = "mcap-location-measure-points";

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
const ROUTE_ID_PREFIX = "mcap-location-route:";
const COMET_TRAIL_NS = 15_000_000_000n;

const PULSE_PERIOD_MS = 1_600;
const FOLLOW_INTERVAL_MS = 1_000 / 15;
const FOLLOW_MIN_MOVEMENT_PX = 1;
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
  readonly id?: string | number;
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

interface IndexedMapTrack {
  readonly index: IndexedLocationTrack;
  readonly key: string;
  readonly track: McapLocationTrackState;
}

interface MapPlaybackFrame {
  readonly comets: readonly CometTrail[];
  readonly markers: readonly MapLocationMarker[];
  readonly resolutions: ReadonlyMap<string, ResolvedLocationTrackPosition>;
}

interface MapPlaybackPaintState {
  readonly cursors: Map<string, LocationTrackCursor>;
  lastFollowAtMs: number;
  readonly routeProgressKeys: Map<string, string>;
}

interface MapSurfaceActivity {
  documentVisible: boolean;
  hasSize: boolean;
  intersects: boolean;
}

let mapLibreImport: Promise<MapLibreModule> | null = null;
let mapLibreCssImport: Promise<void> | null = null;

const EMPTY_FEATURE_COLLECTION: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const indexedLocationTrackByState = new WeakMap<
  McapLocationTrackState,
  IndexedLocationTrack
>();

const NO_TILE_STYLE: MapLibreStyle = {
  version: 8,
  sources: {},
  layers: [
    {
      id: MCAP_MAP_LOCAL_BACKGROUND_LAYER_ID,
      type: "background",
      paint: { "background-color": "#06101a" },
    },
  ],
};

const McapMapTile: React.FC<McapTileProps> = () => {
  // This effect records tile commits for the performance-stats panel.
  useEffect(() => {
    noteMcapMapReactCommit("tile");
  });
  const tileId = useTileId();
  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <McapMapTileSettings /> }),
    [],
  );
  useRegisterMcapTileSettings(tileId, settingsRegistration);
  const setTileTitle = useSetTileTitle();
  const sources = useSceneInventory();
  const tracksByTopic = useMcapLocationTracksContext();
  const tracksSourceKey = useMcapLocationTracksSourceKey();
  const settings = useMcapMapTileSettings();
  const setSettings = useSetMcapMapTileSettings();
  const mapViewportScope = useMcapMapViewportScope();
  const dataStream = useMcapDataStream();
  const sourceKey = dataStream?.sourceKey ?? null;
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const isPlaying = useIsPlaying();
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [fitRouteNonce, setFitRouteNonce] = useState(0);
  const [measureArmed, setMeasureArmed] = useState(false);
  const [measurement, setMeasurement] = useState<MapMeasurementState | null>(
    null,
  );
  const [basemapState, setBasemapState] = useState<{
    readonly baseLayer: McapMapBaseLayer;
    readonly status: McapMapBasemapStatus;
  }>(() => ({
    baseLayer: settings.baseLayer,
    status: initialMcapMapBasemapStatus(settings.baseLayer),
  }));

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
  const tracks = useMemo(() => {
    if (!sourceKey || tracksSourceKey !== sourceKey) return [];
    return visibleTopics
      .map((topic) => tracksByTopic.get(topic))
      .filter((track): track is McapLocationTrackState => Boolean(track));
  }, [sourceKey, tracksByTopic, tracksSourceKey, visibleTopics]);
  const readyTracks = useMemo(
    () =>
      tracks.filter(
        (track) => track.status === "ready" && track.segments.length > 0,
      ),
    [tracks],
  );
  const locationEvidencePending =
    visibleTopics.length > 0 &&
    (!sourceKey ||
      tracksSourceKey !== sourceKey ||
      tracks.length < visibleTopics.length ||
      tracks.some((track) => track.status === "loading"));

  // This effect keeps the automatic title synchronized with ready tracks.
  useEffect(() => {
    setTileTitle(mapTileTitle(readyTracks, locationSources.length), {
      source: "auto",
    });
  }, [locationSources.length, readyTracks, setTileTitle]);

  const bounds = useMemo(
    () =>
      combineLocationBounds(
        readyTracks.map((track) => locationBounds(track.segments)),
      ),
    [readyTracks],
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

  // This effect owns the Escape shortcut while measurement mode is active.
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
  const trackStatusText = mapStatusText({
    enabledTopicCount: visibleTopics.length,
    errorCount,
    loadingCount,
    locationTopicCount: locationSources.length,
    readyTrackCount: readyTracks.length,
    truncated,
  });
  const basemapStatus =
    basemapState.baseLayer === settings.baseLayer
      ? basemapState.status
      : initialMcapMapBasemapStatus(settings.baseLayer);
  const statusText = joinMapStatusText(
    mcapMapBasemapStatusText(basemapStatus),
    trackStatusText,
  );
  const onBasemapStatusChange = useCallback(
    (baseLayer: McapMapBaseLayer, status: McapMapBasemapStatus) => {
      setBasemapState((current) =>
        current.baseLayer === baseLayer && current.status === status
          ? current
          : { baseLayer, status },
      );
    },
    [],
  );

  return (
    <div className={styles.body} data-testid="mcap-map-tile">
      <McapMapLibreSurface
        basemapStatus={basemapStatus}
        bounds={bounds}
        fitRouteNonce={fitRouteNonce}
        followEgo={settings.followEgo}
        locationEvidencePending={locationEvidencePending}
        measureArmed={measureArmed}
        measurement={measurement}
        onHoverTimeNs={onHoverTimeNs}
        onBasemapStatusChange={onBasemapStatusChange}
        onMeasurePick={onMeasurePick}
        onSeekTimeNs={onSeekTimeNs}
        onUserMove={() => setSettings({ followEgo: false })}
        playbackStore={store}
        pulseActive={isPlaying}
        recenterNonce={recenterNonce}
        baseLayer={settings.baseLayer}
        sourceKey={sourceKey}
        tracks={readyTracks}
        timeline={timeline}
        viewportScope={mapViewportScope}
      />
      <div className={styles.overlay}>
        {statusText ? (
          <span aria-live="polite" className={styles.statusBadge} role="status">
            {statusText}
          </span>
        ) : null}
        {readyTracks.length > 0 ? (
          <button
            className={styles.controlButton}
            onClick={() => {
              if (settings.followEgo) {
                setSettings({ followEgo: false });
                setFitRouteNonce((value) => value + 1);
                return;
              }
              setSettings({ followEgo: true });
              setRecenterNonce((value) => value + 1);
            }}
            type="button"
          >
            {settings.followEgo ? "Fit route" : "Follow ego"}
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
  );
};

function McapMapLibreSurface({
  baseLayer,
  basemapStatus,
  bounds,
  fitRouteNonce,
  followEgo,
  locationEvidencePending,
  measureArmed,
  measurement,
  onHoverTimeNs,
  onBasemapStatusChange,
  onMeasurePick,
  onSeekTimeNs,
  onUserMove,
  playbackStore,
  pulseActive,
  recenterNonce,
  sourceKey,
  tracks,
  timeline,
  viewportScope,
}: {
  readonly baseLayer: McapMapBaseLayer;
  readonly basemapStatus: McapMapBasemapStatus;
  readonly bounds: LocationBounds | null;
  readonly fitRouteNonce: number;
  readonly followEgo: boolean;
  readonly locationEvidencePending: boolean;
  readonly measureArmed: boolean;
  readonly measurement: MapMeasurementState | null;
  readonly onHoverTimeNs: (timeNs: bigint | null) => void;
  readonly onBasemapStatusChange: (
    baseLayer: McapMapBaseLayer,
    status: McapMapBasemapStatus,
  ) => void;
  readonly onMeasurePick: (point: MapMeasurementPoint) => void;
  readonly onSeekTimeNs: (timeNs: bigint) => void;
  readonly onUserMove: () => void;
  readonly playbackStore: PlaybackStore;
  readonly pulseActive: boolean;
  readonly recenterNonce: number;
  readonly sourceKey: string | null;
  readonly tracks: readonly McapLocationTrackState[];
  readonly timeline: McapTimelineIndex | null;
  readonly viewportScope: string | null;
}) {
  // This effect records surface commits for the performance-stats panel.
  useEffect(() => {
    noteMcapMapReactCommit("surface");
  });
  const indexedTracks = useMemo(() => tracks.map(indexedMapTrack), [tracks]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const cameraEpochRef = useRef<string | null>(null);
  const previousViewportScopeRef = useRef(viewportScope);
  const previousSourceKeyRef = useRef(sourceKey);
  const initialFrameEpochRef = useRef<string | null>(null);
  const warmStartEpochRef = useRef<string | null>(null);
  const userInteractedRef = useRef(false);
  const recenterGuardUntilRef = useRef(0);
  const suppressViewportWriteRef = useRef(false);
  const playbackControllerRef = useRef<McapMapPlaybackController | null>(null);
  const installedTrackLayersRef = useRef(
    new Map<string, McapLocationTrackState>(),
  );
  const installedBaseLayerRef = useRef<McapMapBaseLayer>(
    MCAP_MAP_BASE_LAYER.NONE,
  );
  const basemapStatusRef = useRef<McapMapBasemapStatus>("disabled");
  const playbackPaintStateRef = useRef<MapPlaybackPaintState>({
    cursors: new Map(),
    lastFollowAtMs: Number.NEGATIVE_INFINITY,
    routeProgressKeys: new Map(),
  });
  const latestPlaybackFrameRef = useRef<MapPlaybackFrame>(
    emptyMapPlaybackFrame(),
  );
  const surfaceActivityRef = useRef<MapSurfaceActivity>({
    documentVisible:
      typeof document === "undefined" || document.visibilityState === "visible",
    hasSize: true,
    intersects: true,
  });
  const measurementHoverRef = useRef<MapMeasurementPoint | null>(null);
  const measurementPreviewFrameRef = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const showStaticPreview = shouldShowMcapMapStaticPreview({
    basemapStatus,
    cameraReady,
    failed,
    mapLoaded: loaded,
  });
  const onSeekTimeNsRef = useRef(onSeekTimeNs);
  const onHoverTimeNsRef = useRef(onHoverTimeNs);
  const onMeasurePickRef = useRef(onMeasurePick);
  const onUserMoveRef = useRef(onUserMove);
  const measureArmedRef = useRef(measureArmed);
  const measurementRef = useRef(measurement);
  const viewportScopeRef = useRef(viewportScope);
  const indexedTracksRef = useRef(indexedTracks);
  const followEgoRef = useRef(followEgo);
  const pulseActiveRef = useRef(pulseActive);
  const sourceKeyRef = useRef(sourceKey);
  onSeekTimeNsRef.current = onSeekTimeNs;
  onHoverTimeNsRef.current = onHoverTimeNs;
  onMeasurePickRef.current = onMeasurePick;
  onUserMoveRef.current = onUserMove;
  measureArmedRef.current = measureArmed;
  measurementRef.current = measurement;
  viewportScopeRef.current = viewportScope;
  indexedTracksRef.current = indexedTracks;
  followEgoRef.current = followEgo;
  pulseActiveRef.current = pulseActive;
  sourceKeyRef.current = sourceKey;

  const cameraEpoch = `${viewportScope ?? ""}\0${sourceKey ?? ""}`;

  // This effect pauses imperative map work when the surface cannot be seen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const activity = surfaceActivityRef.current;
    const syncActivity = () => {
      playbackControllerRef.current?.setSurfaceActive(
        isMapSurfaceActive(activity),
      );
    };
    const handleVisibilityChange = () => {
      activity.documentVisible = document.visibilityState === "visible";
      syncActivity();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        activity.intersects = entry?.isIntersecting ?? false;
        syncActivity();
      });
      intersectionObserver.observe(container);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      activity.hasSize =
        container.clientWidth > 0 && container.clientHeight > 0;
      resizeObserver = new ResizeObserver(([entry]) => {
        const width = entry?.contentRect.width ?? container.clientWidth;
        const height = entry?.contentRect.height ?? container.clientHeight;
        activity.hasSize = width > 0 && height > 0;
        if (activity.hasSize) mapRef.current?.resize();
        syncActivity();
      });
      resizeObserver.observe(container);
    }
    syncActivity();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, []);

  // This effect owns the MapLibre instance and its imperative subscriptions.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || failed) {
      return undefined;
    }
    setLoaded(false);
    setCameraReady(false);
    cameraReadyRef.current = false;
    loadedRef.current = false;
    warmStartEpochRef.current = null;
    const installedTrackLayers = installedTrackLayersRef.current;
    let cancelled = false;
    let webglCanvas: HTMLCanvasElement | null = null;
    let handleWebglContextLost: ((event: Event) => void) | null = null;
    let handleWebglContextRestored: (() => void) | null = null;

    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        const map = new maplibregl.Map({
          attributionControl: false,
          center: [0, 0],
          container: containerRef.current,
          interactive: true,
          pitchWithRotate: false,
          style: NO_TILE_STYLE,
          zoom: 1,
        });
        mapRef.current = map;
        map.addControl(
          new maplibregl.NavigationControl({
            showCompass: false,
            showZoom: true,
          }),
          "bottom-right",
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
            userInteractedRef.current = true;
            onUserMoveRef.current();
          }
        };
        map.on("dragstart", handleUserMove);
        map.on("zoomstart", handleUserMove);
        map.on("rotatestart", handleUserMove);
        map.on("pitchstart", handleUserMove);
        map.on("moveend", () => {
          if (!suppressViewportWriteRef.current) {
            rememberMapViewport(map, viewportScopeRef.current);
          }
        });
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
            measurementHoverRef.current = null;
            scheduleMeasurementPreviewUpdate(
              map,
              measurementRef,
              measurementHoverRef,
              measurementPreviewFrameRef,
            );
            return;
          }
          measurementHoverRef.current = measurementPointFromMapEvent(event);
          scheduleMeasurementPreviewUpdate(
            map,
            measurementRef,
            measurementHoverRef,
            measurementPreviewFrameRef,
          );
        });
        // "mouseleave" only exists as a layer-scoped event; the map-level
        // pointer-exit event is "mouseout".
        map.on("mouseout", () => {
          measurementHoverRef.current = null;
          scheduleMeasurementPreviewUpdate(
            map,
            measurementRef,
            measurementHoverRef,
            measurementPreviewFrameRef,
          );
        });
        webglCanvas = map.getCanvas();
        handleWebglContextLost = (event: Event) => {
          event.preventDefault();
          loadedRef.current = false;
          setLoaded(false);
        };
        handleWebglContextRestored = () => {
          loadedRef.current = true;
          setFailed(false);
          setLoaded(loadedRef.current);
          map.resize();
          map.triggerRepaint();
        };
        webglCanvas.addEventListener(
          "webglcontextlost",
          handleWebglContextLost,
        );
        webglCanvas.addEventListener(
          "webglcontextrestored",
          handleWebglContextRestored,
        );
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (measurementPreviewFrameRef.current !== null) {
        cancelAnimationFrame(measurementPreviewFrameRef.current);
        measurementPreviewFrameRef.current = null;
      }
      if (webglCanvas && handleWebglContextLost) {
        webglCanvas.removeEventListener(
          "webglcontextlost",
          handleWebglContextLost,
        );
      }
      if (webglCanvas && handleWebglContextRestored) {
        webglCanvas.removeEventListener(
          "webglcontextrestored",
          handleWebglContextRestored,
        );
      }
      const map = mapRef.current;
      if (map) {
        rememberMapViewport(map, viewportScopeRef.current);
        map.remove();
        mapRef.current = null;
      }
      loadedRef.current = false;
      installedBaseLayerRef.current = MCAP_MAP_BASE_LAYER.NONE;
      basemapStatusRef.current = "disabled";
      installedTrackLayers.clear();
    };
  }, [failed]);

  // This effect allows a failed map to retry after the base layer changes.
  useEffect(() => {
    setFailed(false);
  }, [baseLayer]);

  // This effect keeps the local trajectory style live while the provider style
  // and its initial sources load. It waits for the route-derived camera before
  // installing the remote style, avoiding throwaway Null Island tile work.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return undefined;

    let cancelled = false;
    let removeReadinessListeners: () => void = () => undefined;
    const report = (status: McapMapBasemapStatus) => {
      if (cancelled) return;
      basemapStatusRef.current = status;
      onBasemapStatusChange(baseLayer, status);
    };

    if (baseLayer === MCAP_MAP_BASE_LAYER.NONE) {
      report("disabled");
      if (installedBaseLayerRef.current !== MCAP_MAP_BASE_LAYER.NONE) {
        installedBaseLayerRef.current = MCAP_MAP_BASE_LAYER.NONE;
        map.setStyle(NO_TILE_STYLE, {
          transformStyle: mergeMcapMapOverlaysIntoStyle,
        });
        ensureCurrentPuckImages(map, indexedTracksRef.current);
        playbackControllerRef.current?.invalidate();
      }
      return () => {
        cancelled = true;
      };
    }

    if (
      installedBaseLayerRef.current === baseLayer &&
      basemapStatusRef.current === "ready"
    ) {
      report("ready");
      return () => {
        cancelled = true;
      };
    }

    report("loading");
    void loadOpenFreeMapStyle()
      .then((style) => {
        if (cancelled) return;
        const styleAlreadyInstalled =
          installedBaseLayerRef.current === baseLayer;
        if (!styleAlreadyInstalled && !cameraReady) return;
        const sourceIds = mcapMapBasemapSourceIds(style);
        let overlaysRestored = false;
        const restoreOverlays = () => {
          if (overlaysRestored || cancelled) return;
          ensureCurrentPuckImages(map, indexedTracksRef.current);
          playbackControllerRef.current?.invalidate();
          overlaysRestored = true;
        };
        const markReadyWhenLoaded = () => {
          if (
            cancelled ||
            sourceIds.some(
              (id) => !map.getSource(id) || !map.isSourceLoaded(id),
            )
          ) {
            return;
          }
          restoreOverlays();
          report("ready");
          removeReadinessListeners();
        };
        const handleStyleData = () => {
          restoreOverlays();
          markReadyWhenLoaded();
        };
        removeReadinessListeners = () => {
          map.off("sourcedata", markReadyWhenLoaded);
          map.off("styledata", handleStyleData);
          removeReadinessListeners = () => undefined;
        };
        map.on("sourcedata", markReadyWhenLoaded);
        map.on("styledata", handleStyleData);
        if (!styleAlreadyInstalled) {
          installedBaseLayerRef.current = baseLayer;
          map.setStyle(style, {
            transformStyle: mergeMcapMapOverlaysIntoStyle,
          });
        }
        markReadyWhenLoaded();
      })
      .catch(() => {
        if (cancelled) return;
        installedBaseLayerRef.current = MCAP_MAP_BASE_LAYER.NONE;
        report("error");
      });

    return () => {
      cancelled = true;
      removeReadinessListeners();
    };
  }, [baseLayer, cameraReady, loaded, onBasemapStatusChange]);

  // This effect invalidates automatic camera work from the previous
  // recording. The validated warm-start effect below makes the map visible
  // again once real location evidence arrives.
  useEffect(() => {
    if (cameraEpochRef.current !== cameraEpoch) {
      const sourceChanged = previousSourceKeyRef.current !== sourceKey;
      if (sourceChanged) {
        latestPlaybackFrameRef.current = emptyMapPlaybackFrame();
        playbackPaintStateRef.current.cursors.clear();
        playbackPaintStateRef.current.routeProgressKeys.clear();
      }
      const preserveLiveCamera =
        sourceChanged &&
        cameraReadyRef.current &&
        loadedRef.current &&
        canPreserveMcapMapViewportBetweenSamples(
          previousViewportScopeRef.current,
          viewportScope,
        );
      if (preserveLiveCamera && mapRef.current) {
        // Capture the latest follow position once at the sample boundary. The
        // ordinary follow loop deliberately avoids per-tick cache writes.
        rememberMapViewport(mapRef.current, viewportScope);
      }
      cameraEpochRef.current = cameraEpoch;
      initialFrameEpochRef.current = null;
      warmStartEpochRef.current = null;
      userInteractedRef.current = false;
      if (!preserveLiveCamera) {
        cameraReadyRef.current = false;
        setCameraReady(false);
      }
      previousViewportScopeRef.current = viewportScope;
      previousSourceKeyRef.current = sourceKey;
    }
  }, [cameraEpoch, sourceKey, viewportScope]);

  // This effect synchronizes the measurement cursor and clears stale preview.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = measureArmed ? "crosshair" : "";
    if (!measureArmed) {
      measurementHoverRef.current = null;
      setGeoJsonSourceData(
        map,
        MEASURE_PREVIEW_SOURCE_ID,
        EMPTY_FEATURE_COLLECTION,
      );
    }
  }, [measureArmed, loaded]);

  // This effect owns the playback subscription and its capped map controller.
  useEffect(() => {
    const controller = new McapMapPlaybackController({
      onPaint: (playheadNs, nowMs) => {
        const indexed = indexedTracksRef.current;
        const paintState = playbackPaintStateRef.current;
        const frame = mapPlaybackFrameAt(
          indexed,
          playheadNs,
          paintState.cursors,
        );
        latestPlaybackFrameRef.current = frame;
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;

        noteMcapMapPlaybackPaint();
        paintMapPlaybackFrame(map, indexed, frame, paintState);
        if (
          sourceKeyRef.current &&
          cameraReadyRef.current &&
          followEgoRef.current &&
          !userInteractedRef.current &&
          initialFrameEpochRef.current !== cameraEpochRef.current
        ) {
          const target = playbackCameraTarget(
            null,
            frame.markers,
            frame.comets,
          );
          if (target) {
            initialFrameEpochRef.current = cameraEpochRef.current;
            recenterGuardUntilRef.current = nowMs + RECENTER_GUARD_MS;
            applyMcapMapCameraTarget(map, target, 240);
          }
        }
        updateFollowCamera({
          cameraReady: cameraReadyRef.current,
          current: frame.markers[0]?.location ?? null,
          enabled: followEgoRef.current,
          map,
          nowMs,
          paintState,
          recenterGuardUntil: recenterGuardUntilRef.current,
          suppressViewportWriteRef,
        });
        updateMapPulse(map, pulseActiveRef.current, nowMs);
      },
    });
    playbackControllerRef.current = controller;
    controller.setSurfaceActive(isMapSurfaceActive(surfaceActivityRef.current));

    const publish = () => {
      controller.updatePlayhead(
        timeline ? timeline.secToNs(getPlayhead(playbackStore)) : null,
        !getIsPlaying(playbackStore),
      );
    };
    const unsubscribe = subscribePlayhead(playbackStore, publish);
    publish();
    return () => {
      unsubscribe();
      controller.dispose();
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
      }
    };
  }, [playbackStore, timeline]);

  // This effect publishes track-static sources, images, and layer membership.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    ensurePuckImages(
      map,
      indexedTracks.map(({ track }) => track.color),
    );
    reconcileTrackLayers(map, indexedTracks, installedTrackLayersRef.current);
    setGeoJsonSourceData(
      map,
      HIT_SOURCE_ID,
      hitPointFeatures(indexedTracks.map(({ track }) => track)),
    );
    prunePlaybackPaintState(playbackPaintStateRef.current, indexedTracks);
    playbackControllerRef.current?.invalidate();
  }, [indexedTracks, loaded]);

  // This effect isolates hover subscription updates to the hover source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return undefined;
    const publish = () => {
      const hoverSec = getHoverTime(playbackStore);
      const hoverNs =
        hoverSec !== null && timeline ? timeline.secToNs(hoverSec) : null;
      setGeoJsonSourceData(
        map,
        HOVER_SOURCE_ID,
        markerFeatures(indexedTrackMarkersAt(indexedTracks, hoverNs)),
      );
    };
    const unsubscribe = subscribeHoverTime(playbackStore, publish);
    publish();
    return unsubscribe;
  }, [indexedTracks, loaded, playbackStore, timeline]);

  // This effect clears shared hover state when this map surface unmounts.
  useEffect(
    () => () => {
      setHoverTime(playbackStore, null);
    },
    [playbackStore],
  );

  // This effect publishes committed measurement geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    setGeoJsonSourceData(
      map,
      MEASURE_LINE_SOURCE_ID,
      measurementLineFeature(measurement),
    );
    setGeoJsonSourceData(
      map,
      MEASURE_POINTS_SOURCE_ID,
      measurementPointFeatures(measurement),
    );
    setGeoJsonSourceData(
      map,
      MEASURE_PREVIEW_SOURCE_ID,
      measurementPreviewFeature(measurement, measurementHoverRef.current),
    );
  }, [loaded, measurement]);

  // This effect synchronizes pulse state and flushes the final paused frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!pulseActive) {
      map.setPaintProperty(PULSE_LAYER_ID, "circle-opacity", 0);
      playbackControllerRef.current?.updatePlayhead(
        timeline ? timeline.secToNs(getPlayhead(playbackStore)) : null,
        true,
      );
    } else {
      playbackControllerRef.current?.invalidate();
    }
  }, [loaded, playbackStore, pulseActive, timeline]);

  // This effect repaints immediately when continuous follow is enabled.
  useEffect(() => {
    if (followEgo) playbackControllerRef.current?.invalidate();
  }, [followEgo, loaded]);

  // This effect validates the dataset-scoped warm start before
  // exposing the map. A cached location is useful only when the new marker or
  // route falls within the zoom-scaled proximity window.
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    const frame = latestPlaybackFrameRef.current;
    const marker = frame.markers[0]?.location ?? null;
    if (
      !sourceKey ||
      !map ||
      !container ||
      !loadedRef.current ||
      warmStartEpochRef.current === cameraEpoch
    ) {
      return;
    }
    if (!marker && !bounds) {
      if (locationEvidencePending) return;
      warmStartEpochRef.current = cameraEpoch;
      cameraReadyRef.current = true;
      setCameraReady(true);
      playbackControllerRef.current?.invalidate();
      return;
    }

    warmStartEpochRef.current = cameraEpoch;
    const viewport = readMcapMapViewport(viewportScope);
    const warmStartApplies =
      viewport !== null &&
      mcapMapViewportIsNearEvidence({
        bounds,
        height: container.clientHeight,
        marker,
        viewport,
        width: container.clientWidth,
      });
    if (viewport && warmStartApplies) {
      initialFrameEpochRef.current = cameraEpoch;
      map.jumpTo({
        center: [viewport.longitude, viewport.latitude],
        zoom: viewport.zoom,
      });
    } else {
      const target = playbackCameraTarget(bounds, frame.markers, frame.comets);
      if (target) {
        initialFrameEpochRef.current = cameraEpoch;
        applyMcapMapCameraTarget(map, target, 0);
      }
    }
    cameraReadyRef.current = true;
    setCameraReady(true);
    playbackControllerRef.current?.invalidate();
  }, [
    bounds,
    cameraEpoch,
    loaded,
    locationEvidencePending,
    sourceKey,
    viewportScope,
  ]);

  // This effect applies each explicit Recenter request exactly once. It fits
  // the recent trail when one exists, then falls back to the marker or route.
  useEffect(() => {
    const map = mapRef.current;
    if (recenterNonce === 0 || !map || !loadedRef.current) {
      return;
    }
    initialFrameEpochRef.current = cameraEpoch;
    recenterGuardUntilRef.current = performance.now() + RECENTER_GUARD_MS;
    const frame = latestPlaybackFrameRef.current;
    applyMcapMapCameraTarget(
      map,
      playbackCameraTarget(bounds, frame.markers, frame.comets),
      400,
    );
    // Latest-closure effect: only the nonce (and load state) may trigger
    // it — depending on trail/marker would re-run the camera move every
    // playhead tick — but React runs the freshest closure, so the values
    // read here are current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterNonce, loaded]);

  // This effect applies each explicit Fit route request exactly once.
  useEffect(() => {
    const map = mapRef.current;
    if (fitRouteNonce === 0 || !map || !loadedRef.current || !bounds) {
      return;
    }
    applyMcapMapCameraTarget(map, mcapMapRouteCameraTarget(bounds), 400);
    // Bounds grow as track data arrives, but only another button press should
    // move a camera the user may have adjusted in the meantime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRouteNonce, loaded]);

  return (
    <>
      <div className={styles.map} ref={containerRef} />
      {showStaticPreview ? (
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

function indexedTrackMarkersAt(
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
  addGeoJsonSource(map, HIT_SOURCE_ID);
  addGeoJsonSource(map, CURRENT_SOURCE_ID);
  addGeoJsonSource(map, HOVER_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_LINE_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_PREVIEW_SOURCE_ID);
  addGeoJsonSource(map, MEASURE_POINTS_SOURCE_ID);

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

function playbackCameraTarget(
  bounds: LocationBounds | null,
  currentLocations: readonly MapLocationMarker[],
  comets: readonly CometTrail[],
): McapMapCameraTarget | null {
  return mcapMapPlaybackCameraTarget({
    bounds,
    marker: currentLocations[0]?.location ?? null,
    trailBounds: coordinateBounds(comets.flatMap((trail) => trail.coordinates)),
  });
}

function applyMcapMapCameraTarget(
  map: MapLibreMap,
  target: McapMapCameraTarget | null,
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

function rememberMapViewport(
  map: MapLibreMap,
  viewportScope: string | null,
): void {
  const center = map.getCenter();
  writeMcapMapViewport(viewportScope, {
    latitude: center.lat,
    longitude: center.lng,
    zoom: map.getZoom(),
  });
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

function trackLayerKey(track: McapLocationTrackState): string {
  return `${track.color}:${track.topic}`;
}

function indexedMapTrack(track: McapLocationTrackState): IndexedMapTrack {
  let index = indexedLocationTrackByState.get(track);
  if (!index) {
    index = indexLocationTrack(track.segments);
    indexedLocationTrackByState.set(track, index);
  }
  return { index, key: trackLayerKey(track), track };
}

function routeSourceId(key: string): string {
  return `${ROUTE_ID_PREFIX}${key}`;
}

function routeLayerId(key: string, kind: string): string {
  return `${routeSourceId(key)}:${kind}`;
}

function cometSourceId(key: string): string {
  return `${COMET_ID_PREFIX}${key}`;
}

function reconcileTrackLayers(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
  installed: Map<string, McapLocationTrackState>,
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

function addTrackRouteLayers(map: MapLibreMap, indexedTrack: IndexedMapTrack) {
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
        "line-width": 4.5,
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
        "line-width": 2.5,
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
        "line-width": 4.5,
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
        "line-opacity": 0.5,
        "line-width": 2.5,
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
        "line-width": 4.5,
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
          0.5,
          FUTURE_ROUTE_COLOR,
          0.3,
          0,
        ),
        "line-width": 2.5,
      },
    } as never,
    ACCURACY_LAYER_ID,
  );
}

function addCometLayer(map: MapLibreMap, indexedTrack: IndexedMapTrack): void {
  const source = cometSourceId(indexedTrack.key);
  map.addSource(source, {
    type: "geojson",
    data: EMPTY_FEATURE_COLLECTION,
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
        "line-width": 2.5,
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

function staticRouteFeatures(
  indexedTrack: IndexedMapTrack,
): GeoJsonFeatureCollection {
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
                topic: indexedTrack.track.topic,
              },
            },
          ],
    ),
  };
}

function emptyMapPlaybackFrame(): MapPlaybackFrame {
  return { comets: [], markers: [], resolutions: new Map() };
}

function mapPlaybackFrameAt(
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
        topic: indexedTrack.track.topic,
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
              COMET_TRAIL_NS,
            ),
      key: indexedTrack.key,
    });
  }
  return { comets, markers, resolutions };
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

function paintMapPlaybackFrame(
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
    if (resolved) {
      updateRouteProgress(map, indexedTrack, resolved, paintState);
    }
  }
}

function updateRouteProgress(
  map: MapLibreMap,
  indexedTrack: IndexedMapTrack,
  resolved: ResolvedLocationTrackPosition,
  paintState: MapPlaybackPaintState,
): void {
  const { key, track } = indexedTrack;
  if (!map.getLayer(routeLayerId(key, "active"))) return;
  const activeSegment = resolved.segmentIndex;
  const filters = mcapMapRouteProgressFilters(resolved);
  if (paintState.routeProgressKeys.get(key) !== filters.key) {
    map.setFilter(routeLayerId(key, "past-casing"), filters.past as never);
    map.setFilter(routeLayerId(key, "past"), filters.past as never);
    map.setFilter(routeLayerId(key, "future-casing"), filters.future as never);
    map.setFilter(routeLayerId(key, "future"), filters.future as never);
    map.setFilter(routeLayerId(key, "active-casing"), filters.active as never);
    map.setFilter(routeLayerId(key, "active"), filters.active as never);
    paintState.routeProgressKeys.set(key, filters.key);
  }
  if (activeSegment !== null && resolved.lineProgress !== null) {
    map.setPaintProperty(
      routeLayerId(key, "active-casing"),
      "line-gradient",
      activeRouteGradient(
        ROUTE_CASING_COLOR,
        0.85,
        ROUTE_CASING_COLOR,
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
        FUTURE_ROUTE_COLOR,
        0.3,
        resolved.lineProgress,
      ) as never,
    );
  }
}

function activeRouteGradient(
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

function lineFeatureCollection(
  coordinates: readonly [number, number][],
): GeoJsonFeatureCollection {
  if (coordinates.length < 2) return EMPTY_FEATURE_COLLECTION;
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

function prunePlaybackPaintState(
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

function updateFollowCamera({
  cameraReady,
  current,
  enabled,
  map,
  nowMs,
  paintState,
  recenterGuardUntil,
  suppressViewportWriteRef,
}: {
  readonly cameraReady: boolean;
  readonly current: InterpolatedLocation | null;
  readonly enabled: boolean;
  readonly map: MapLibreMap;
  readonly nowMs: number;
  readonly paintState: MapPlaybackPaintState;
  readonly recenterGuardUntil: number;
  readonly suppressViewportWriteRef: React.MutableRefObject<boolean>;
}): void {
  if (
    !cameraReady ||
    !enabled ||
    !current ||
    nowMs < recenterGuardUntil ||
    nowMs - paintState.lastFollowAtMs < FOLLOW_INTERVAL_MS
  ) {
    return;
  }
  paintState.lastFollowAtMs = nowMs;
  const center = map.project(map.getCenter());
  const target = map.project([current.longitude, current.latitude]);
  if (
    Math.hypot(target.x - center.x, target.y - center.y) <
    FOLLOW_MIN_MOVEMENT_PX
  ) {
    return;
  }
  suppressViewportWriteRef.current = true;
  try {
    noteMcapMapFollowCommand();
    map.jumpTo({ center: [current.longitude, current.latitude] });
  } finally {
    suppressViewportWriteRef.current = false;
  }
}

function updateMapPulse(
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

function isMapSurfaceActive(activity: MapSurfaceActivity): boolean {
  return activity.documentVisible && activity.hasSize && activity.intersects;
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
  const source = map.getSource(sourceId);
  if (isGeoJsonSource(source)) {
    noteMcapMapSourceUpdate(sourceId);
    source.setData(data);
  }
}

function isGeoJsonSource(
  source: unknown,
): source is { setData: (data: GeoJsonFeatureCollection) => void } {
  return (
    typeof (source as { setData?: unknown } | undefined)?.setData === "function"
  );
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

function scheduleMeasurementPreviewUpdate(
  map: MapLibreMap,
  measurementRef: React.MutableRefObject<MapMeasurementState | null>,
  hoverRef: React.MutableRefObject<MapMeasurementPoint | null>,
  frameRef: React.MutableRefObject<number | null>,
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

function joinMapStatusText(
  ...parts: readonly (string | null)[]
): string | null {
  const status = parts.filter((part): part is string => Boolean(part));
  return status.length > 0 ? status.join(" · ") : null;
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

function ensureCurrentPuckImages(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
): void {
  ensurePuckImages(
    map,
    tracks.map(({ track }) => track.color),
  );
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
