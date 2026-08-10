import { useEffect, useMemo, useRef, useState } from "react";
import {
  type LocationBounds,
  type LocationTrackState,
} from "../tracks/location-track";
import {
  haversineDistanceMeters,
  normalizeLongitudeIntervalEast,
} from "../wgs84";
import { ensurePuckImages } from "./puck";
import {
  type MapMeasurementPoint,
  type MapMeasurementState,
} from "../measurement";
import { mapRouteCameraTarget } from "../viewport/camera";
import { MAP_BASE_LAYER, type MapBaseLayer } from "./types";
import {
  loadOpenFreeMapStyle,
  MAP_LOCAL_BACKGROUND_LAYER_ID,
  mapBasemapSourceIds,
  mergeMapOverlaysIntoStyle,
  shouldShowMapStaticPreview,
  type MapBasemapStatus,
} from "../basemap";
import {
  canPreserveMapViewportBetweenSamples,
  readMapViewport,
} from "../viewport/cache";
import { mapViewportIsNearEvidence } from "../viewport/proximity";
import {
  BasemapReadinessGate,
  basemapRetryDelayMs,
} from "../basemap-readiness";
import { MapPlaybackController } from "./playback-controller";
import { noteMapPlaybackPaint, noteMapReactCommit } from "./performance";
import { StaticMapPreview } from "./StaticMapPreview";
import {
  addMapSourcesAndLayers,
  HIT_LAYER_ID,
  HIT_SOURCE_ID,
  HOVER_SOURCE_ID,
  MEASURE_LINE_SOURCE_ID,
  MEASURE_POINTS_SOURCE_ID,
  MEASURE_PREVIEW_SOURCE_ID,
  PULSE_LAYER_ID,
} from "./map-sources";
import styles from "./MapRenderer.module.css";
import {
  applyMapCameraTarget,
  createFollowCameraState,
  playbackCameraTarget,
  RECENTER_GUARD_MS,
  rememberMapViewport,
  updateFollowCamera,
} from "./follow-camera";
import {
  emptyMapPlaybackFrame,
  indexedTrackMarkersAt,
  invalidatePlaybackStyleState,
  mapMarkerFeatures,
  mapPlaybackFrameAt,
  paintMapPlaybackFrame,
  prunePlaybackPaintState,
  updateMapPulse,
  withLiveMapMarkers,
  type MapLocationMarker,
  type MapPlaybackFrame,
  type MapPlaybackPaintState,
} from "./playback-paint";
import {
  createIndexedMapTrack,
  EMPTY_MAP_FEATURE_COLLECTION,
  rehydrateTrackLayers,
  reconcileTrackLayers,
  setGeoJsonSourceData,
  type IndexedMapTrack,
} from "./route-layers";
import {
  hitPointFeatures,
  measurementLineFeature,
  measurementPointFeatures,
  measurementPointFromMapEvent,
  measurementPreviewFeature,
  scheduleMeasurementPreviewUpdate,
  timeNsFromMapEvent,
} from "./map-interactions";

// Type-only imports are erased at compile time, so they do not defeat the
// dynamic import that keeps maplibre-gl out of the main bundle.
type MapLibreModule = typeof import("maplibre-gl");
type MapLibreMap = import("maplibre-gl").Map;
type MapLibreStyle = import("maplibre-gl").StyleSpecification;

const PROGRESSIVE_ROUTE_FIT_MIN_SPAN_M = 20;
const PROGRESSIVE_ROUTE_FIT_GROWTH_FACTOR = 2;

interface MapSurfaceActivity {
  documentVisible: boolean;
  hasSize: boolean;
  intersects: boolean;
}

let mapLibreImport: Promise<MapLibreModule> | null = null;
let mapLibreCssImport: Promise<void> | null = null;

const EMPTY_FEATURE_COLLECTION = EMPTY_MAP_FEATURE_COLLECTION;

const NO_TILE_STYLE: MapLibreStyle = {
  version: 8,
  sources: {},
  layers: [
    {
      id: MAP_LOCAL_BACKGROUND_LAYER_ID,
      type: "background",
      paint: { "background-color": "#06101a" },
    },
  ],
};

/** Playback state required by the map renderer, expressed in nanoseconds. */
export interface MapRendererPlayback {
  readonly clearHover: () => void;
  readonly readHoverTimeNs: () => bigint | null;
  readonly readPlayhead: () => {
    readonly paused: boolean;
    readonly timeNs: bigint | null;
  };
  readonly subscribeHover: (listener: () => void) => () => void;
  readonly subscribePlayhead: (listener: () => void) => () => void;
}

/** Owns the MapLibre instance, event wiring, and imperative playback surface. */
export function MapLibreSurface({
  baseLayer,
  basemapRetryNonce = 0,
  bounds,
  fitRouteNonce,
  followEgo,
  locationEvidencePending,
  liveMarkers,
  measureArmed,
  measurement,
  onHoverTimeNs,
  onBasemapStatusChange,
  onMeasurePick,
  onSeekTimeNs,
  onUserMove,
  playback,
  pulseActive,
  recenterNonce,
  sourceKey,
  tracks,
  viewportScope,
}: {
  readonly baseLayer: MapBaseLayer;
  readonly basemapRetryNonce?: number;
  readonly bounds: LocationBounds | null;
  readonly fitRouteNonce: number;
  readonly followEgo: boolean;
  readonly locationEvidencePending: boolean;
  readonly liveMarkers: readonly MapLocationMarker[];
  readonly measureArmed: boolean;
  readonly measurement: MapMeasurementState | null;
  readonly onHoverTimeNs: (timeNs: bigint | null) => void;
  readonly onBasemapStatusChange: (
    baseLayer: MapBaseLayer,
    status: MapBasemapStatus,
  ) => void;
  readonly onMeasurePick: (point: MapMeasurementPoint) => void;
  readonly onSeekTimeNs: (timeNs: bigint) => void;
  readonly onUserMove: () => void;
  readonly playback: MapRendererPlayback;
  readonly pulseActive: boolean;
  readonly recenterNonce: number;
  readonly sourceKey: string | null;
  readonly tracks: readonly LocationTrackState[];
  readonly viewportScope: string | null;
}) {
  // This effect records surface commits for the performance-stats panel.
  useEffect(() => {
    noteMapReactCommit("surface");
  });
  const indexedTracks = useMemo(
    () => tracks.map(createIndexedMapTrack),
    [tracks],
  );
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
  const progressiveRouteFitRef = useRef({
    cameraEpoch: null as string | null,
    enabled: false,
    lastFitSpanM: 0,
  });
  const playbackControllerRef = useRef<MapPlaybackController | null>(null);
  const installedTrackLayersRef = useRef(new Map<string, LocationTrackState>());
  const installedBaseLayerRef = useRef<MapBaseLayer>(MAP_BASE_LAYER.NONE);
  const basemapStatusRef = useRef<MapBasemapStatus>("disabled");
  const basemapRetryCycleRef = useRef({ attempt: 0, key: "" });
  const playbackPaintStateRef = useRef<MapPlaybackPaintState>({
    cursors: new Map(),
    routeProgressKeys: new Map(),
  });
  const followCameraStateRef = useRef(createFollowCameraState());
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
  const [basemapAutoRetryNonce, setBasemapAutoRetryNonce] = useState(0);
  const showStaticPreview = shouldShowMapStaticPreview({
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
  const liveMarkersRef = useRef(liveMarkers);
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
  liveMarkersRef.current = liveMarkers;
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
          renderWorldCopies: true,
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
          addMapSourcesAndLayers(map);
          setLoaded(true);
        });
        map.on("style.load", () => {
          if (!loadedRef.current) return;
          const indexed = indexedTracksRef.current;
          ensureCurrentPuckImages(map, indexed, liveMarkersRef.current);
          rehydrateTrackLayers(map, indexed, installedTrackLayers);
          setGeoJsonSourceData(
            map,
            HIT_SOURCE_ID,
            hitPointFeatures(indexed.map(({ track }) => track)),
          );
          invalidatePlaybackStyleState(playbackPaintStateRef.current);
          playbackControllerRef.current?.invalidate();
        });
        map.on("error", () => {
          if (!loadedRef.current) {
            setFailed(true);
          }
        });
        const handleUserMove = (event: { originalEvent?: unknown }) => {
          if (event.originalEvent) {
            userInteractedRef.current = true;
            progressiveRouteFitRef.current.enabled = false;
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
      installedBaseLayerRef.current = MAP_BASE_LAYER.NONE;
      basemapStatusRef.current = "disabled";
      installedTrackLayers.clear();
    };
  }, [failed]);

  // This effect allows a failed map to retry after the base layer changes.
  useEffect(() => {
    setFailed(false);
  }, [baseLayer]);

  // This effect keeps the local trajectory style live while the provider earns
  // readiness with its first successful tile. Only active provider-source
  // errors participate, and readiness is monotonic for the installed attempt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return undefined;

    const retryKey = `${baseLayer}:${basemapRetryNonce}`;
    const retryCycle = basemapRetryCycleRef.current;
    if (retryCycle.key !== retryKey) {
      retryCycle.key = retryKey;
      retryCycle.attempt = 0;
    }
    const attempt = retryCycle.attempt;
    let cancelled = false;
    let gate: BasemapReadinessGate | null = null;
    let listenersInstalled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const report = (status: MapBasemapStatus) => {
      if (cancelled || basemapStatusRef.current === status) return;
      basemapStatusRef.current = status;
      onBasemapStatusChange(baseLayer, status);
    };
    const removeAttemptListeners = () => {
      gate?.dispose();
      gate = null;
      if (!listenersInstalled) return;
      map.off("error", handleProviderError);
      map.off("sourcedata", handleSourceData);
      map.off("styledata", handleStyleData);
      listenersInstalled = false;
    };
    const restoreLocalFallback = () => {
      installedBaseLayerRef.current = MAP_BASE_LAYER.NONE;
      map.setStyle(NO_TILE_STYLE, {
        transformStyle: mergeMapOverlaysIntoStyle,
      });
      ensureCurrentPuckImages(
        map,
        indexedTracksRef.current,
        liveMarkersRef.current,
      );
      playbackControllerRef.current?.invalidate();
    };
    const failAttempt = () => {
      if (cancelled) return;
      removeAttemptListeners();
      const retryDelayMs = basemapRetryDelayMs(attempt);
      if (retryDelayMs !== null) {
        retryCycle.attempt = attempt + 1;
        restoreLocalFallback();
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (!cancelled) setBasemapAutoRetryNonce((value) => value + 1);
        }, retryDelayMs);
        return;
      }
      restoreLocalFallback();
      report("error");
    };
    const handleProviderError = (event: unknown) => gate?.handleError(event);
    const handleSourceData = (event: unknown) => gate?.handleSourceData(event);
    const handleStyleData = () => {
      ensureCurrentPuckImages(
        map,
        indexedTracksRef.current,
        liveMarkersRef.current,
      );
      playbackControllerRef.current?.invalidate();
    };

    if (baseLayer === MAP_BASE_LAYER.NONE) {
      retryCycle.attempt = 0;
      if (installedBaseLayerRef.current !== MAP_BASE_LAYER.NONE) {
        restoreLocalFallback();
      }
      report("disabled");
      return () => {
        cancelled = true;
      };
    }

    if (!cameraReady) {
      report("loading");
      return () => {
        cancelled = true;
      };
    }
    if (
      attempt === 0 &&
      installedBaseLayerRef.current === baseLayer &&
      basemapStatusRef.current === "ready"
    ) {
      return () => {
        cancelled = true;
      };
    }

    report("loading");
    void loadOpenFreeMapStyle()
      .then((style) => {
        if (cancelled) return;
        const sourceIds = mapBasemapSourceIds(style);
        installedBaseLayerRef.current = baseLayer;
        if (sourceIds.length === 0) {
          map.setStyle(style, {
            transformStyle: mergeMapOverlaysIntoStyle,
          });
          handleStyleData();
          retryCycle.attempt = 0;
          report("ready");
          return;
        }
        gate = new BasemapReadinessGate({
          onFailure: failAttempt,
          onReady: () => {
            if (cancelled) return;
            handleStyleData();
            retryCycle.attempt = 0;
            report("ready");
            removeAttemptListeners();
          },
          sourceIds,
        });
        map.on("error", handleProviderError);
        map.on("sourcedata", handleSourceData);
        map.on("styledata", handleStyleData);
        listenersInstalled = true;
        map.setStyle(style, {
          transformStyle: mergeMapOverlaysIntoStyle,
        });
      })
      .catch(failAttempt);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      removeAttemptListeners();
    };
  }, [
    baseLayer,
    basemapAutoRetryNonce,
    basemapRetryNonce,
    cameraReady,
    loaded,
    onBasemapStatusChange,
  ]);

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
        canPreserveMapViewportBetweenSamples(
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
      progressiveRouteFitRef.current = {
        cameraEpoch,
        enabled: false,
        lastFitSpanM: 0,
      };
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
    const controller = new MapPlaybackController({
      onPaint: (playheadNs, nowMs) => {
        const indexed = indexedTracksRef.current;
        const paintState = playbackPaintStateRef.current;
        const frame = withLiveMapMarkers(
          mapPlaybackFrameAt(indexed, playheadNs, paintState.cursors),
          liveMarkersRef.current,
        );
        latestPlaybackFrameRef.current = frame;
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;

        noteMapPlaybackPaint();
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
            applyMapCameraTarget(map, target, 240);
          }
        }
        updateFollowCamera({
          cameraReady: cameraReadyRef.current,
          current: frame.markers[0]?.location ?? null,
          enabled: followEgoRef.current,
          map,
          nowMs,
          recenterGuardUntil: recenterGuardUntilRef.current,
          state: followCameraStateRef.current,
          suppressViewportWrite: suppressViewportWriteRef,
        });
        updateMapPulse(map, pulseActiveRef.current, nowMs);
      },
    });
    playbackControllerRef.current = controller;
    controller.setSurfaceActive(isMapSurfaceActive(surfaceActivityRef.current));

    const publish = () => {
      const playhead = playback.readPlayhead();
      controller.updatePlayhead(playhead.timeNs, playhead.paused);
    };
    const unsubscribe = playback.subscribePlayhead(publish);
    publish();
    return () => {
      unsubscribe();
      controller.dispose();
      if (playbackControllerRef.current === controller) {
        playbackControllerRef.current = null;
      }
    };
  }, [playback]);

  // This effect publishes track-static sources, images, and layer membership.
  // Live-marker commits must not reconcile these structures or re-upload the
  // full interaction source.
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
    playbackControllerRef.current?.requestRepaint();
  }, [indexedTracks, loaded]);

  // This effect updates only marker assets/presentation. The controller reads
  // the latest marker ref at paint time, so repeated live fixes coalesce while
  // playback is running and still paint synchronously while paused.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    ensurePuckImages(
      map,
      liveMarkers.map((marker) => marker.color),
    );
    playbackControllerRef.current?.requestRepaint();
  }, [liveMarkers, loaded]);

  // This effect isolates hover subscription updates to the hover source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return undefined;
    const publish = () => {
      setGeoJsonSourceData(
        map,
        HOVER_SOURCE_ID,
        mapMarkerFeatures(
          indexedTrackMarkersAt(indexedTracks, playback.readHoverTimeNs()),
        ),
      );
    };
    const unsubscribe = playback.subscribeHover(publish);
    publish();
    return unsubscribe;
  }, [indexedTracks, loaded, playback]);

  // This effect clears shared hover state when this map surface unmounts.
  useEffect(
    () => () => {
      playback.clearHover();
    },
    [playback],
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
        playback.readPlayhead().timeNs,
        true,
      );
    } else {
      playbackControllerRef.current?.requestRepaint();
    }
  }, [loaded, playback, pulseActive]);

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
      progressiveRouteFitRef.current.enabled = false;
      cameraReadyRef.current = true;
      setCameraReady(true);
      playbackControllerRef.current?.invalidate();
      return;
    }

    warmStartEpochRef.current = cameraEpoch;
    const initialRouteSpanM = mapRouteBoundsSpanMeters(bounds);
    progressiveRouteFitRef.current = {
      cameraEpoch,
      enabled: initialRouteSpanM < PROGRESSIVE_ROUTE_FIT_MIN_SPAN_M,
      lastFitSpanM: initialRouteSpanM,
    };
    const viewport = readMapViewport(viewportScope);
    const warmStartApplies =
      viewport !== null &&
      mapViewportIsNearEvidence({
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
        applyMapCameraTarget(map, target, 0);
      }
    }
    cameraReadyRef.current = true;
    setCameraReady(true);
    playbackControllerRef.current?.invalidate();
  }, [
    bounds,
    cameraEpoch,
    loaded,
    liveMarkers,
    locationEvidencePending,
    sourceKey,
    viewportScope,
  ]);

  // Remote history may initially expose only one location fix. Keep expanding
  // that automatic frame at logarithmic thresholds until the growing trail is
  // actually visible. Any explicit camera/follow interaction ends this startup
  // behavior, so later publications never fight the user.
  useEffect(() => {
    const map = mapRef.current;
    const state = progressiveRouteFitRef.current;
    if (followEgo) {
      state.enabled = false;
      return;
    }
    if (
      !map ||
      !bounds ||
      !loadedRef.current ||
      !cameraReady ||
      !state.enabled ||
      state.cameraEpoch !== cameraEpoch ||
      userInteractedRef.current
    ) {
      return;
    }
    const spanM = mapRouteBoundsSpanMeters(bounds);
    const nextFitSpanM = Math.max(
      PROGRESSIVE_ROUTE_FIT_MIN_SPAN_M,
      state.lastFitSpanM * PROGRESSIVE_ROUTE_FIT_GROWTH_FACTOR,
    );
    if (spanM < nextFitSpanM) return;
    state.lastFitSpanM = spanM;
    applyMapCameraTarget(map, mapRouteCameraTarget(bounds), 240);
  }, [bounds, cameraEpoch, cameraReady, followEgo]);

  // This effect applies each explicit Recenter request exactly once. It fits
  // the recent trail when one exists, then falls back to the marker or route.
  useEffect(() => {
    const map = mapRef.current;
    if (recenterNonce === 0 || !map || !loadedRef.current) {
      return;
    }
    progressiveRouteFitRef.current.enabled = false;
    initialFrameEpochRef.current = cameraEpoch;
    recenterGuardUntilRef.current = performance.now() + RECENTER_GUARD_MS;
    const frame = latestPlaybackFrameRef.current;
    applyMapCameraTarget(
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
    progressiveRouteFitRef.current.enabled = false;
    applyMapCameraTarget(map, mapRouteCameraTarget(bounds), 400);
    // Bounds grow as track data arrives, but only another button press should
    // move a camera the user may have adjusted in the meantime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRouteNonce, loaded]);

  return (
    <>
      <div className={styles.map} ref={containerRef} />
      {showStaticPreview ? (
        <div className={styles.fallback}>
          <StaticMapPreview liveMarkers={liveMarkers} tracks={tracks} />
        </div>
      ) : null}
    </>
  );
}

function isMapSurfaceActive(activity: MapSurfaceActivity): boolean {
  return activity.documentVisible && activity.hasSize && activity.intersects;
}

function mapRouteBoundsSpanMeters(bounds: LocationBounds | null): number {
  if (!bounds) return 0;
  const east = normalizeLongitudeIntervalEast(bounds.west, bounds.east);
  if (east === null || east - bounds.west >= 180) {
    return Number.POSITIVE_INFINITY;
  }
  return haversineDistanceMeters(
    { latitude: bounds.south, longitude: bounds.west },
    { latitude: bounds.north, longitude: east },
  );
}

function ensureCurrentPuckImages(
  map: MapLibreMap,
  tracks: readonly IndexedMapTrack[],
  liveMarkers: readonly MapLocationMarker[],
): void {
  ensurePuckImages(map, [
    ...tracks.map(({ track }) => track.color),
    ...liveMarkers.map((marker) => marker.color),
  ]);
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

export default MapLibreSurface;
