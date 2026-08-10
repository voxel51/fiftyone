import React, { useCallback, useEffect, useMemo, useState } from "react";

import MeasureRulerIcon from "../../../../visualization/panel-ui/MeasureRulerIcon";
import {
  initialMapBasemapStatus,
  mapBasemapStatusText,
  type MapBasemapStatus,
} from "../basemap";
import {
  formatMapMeasurementDistance,
  mapMeasurementDistance,
  nextMapMeasurementState,
  type MapMeasurementPoint,
  type MapMeasurementState,
} from "../measurement";
import {
  combineLocationBounds,
  locationBounds,
  type LocationTrackState,
} from "../tracks/location-track";
import { MapLibreSurface } from "./MapLibreSurface";
import type { MapLocationMarker } from "./playback-paint";
import { joinMapStatusText, MapEmptyState, mapStatusText } from "./MapStatus";
import { noteMapReactCommit } from "./performance";
import { MapLegend } from "./StaticMapPreview";
import { type MapBaseLayer } from "./types";
import styles from "./MapRenderer.module.css";

export type { MapRendererPlayback } from "./MapLibreSurface";
import type { MapRendererPlayback } from "./MapLibreSurface";

/** Prepared geographic evidence and host interactions consumed by the map. */
export interface MapRendererProps {
  readonly baseLayer: MapBaseLayer;
  readonly enabledStreamCount: number;
  readonly errorCount: number;
  readonly followEgo: boolean;
  readonly loadingCount: number;
  readonly locationEvidencePending: boolean;
  readonly locationStreamCount: number;
  readonly liveMarkers: readonly MapLocationMarker[];
  readonly onFollowEgoChange: (followEgo: boolean) => void;
  readonly onHoverTimeNs: (timeNs: bigint | null) => void;
  readonly onSeekTimeNs: (timeNs: bigint) => void;
  readonly playback: MapRendererPlayback;
  readonly pulseActive: boolean;
  readonly sourceKey: string | null;
  readonly tracks: readonly LocationTrackState[];
  readonly truncated: boolean;
  readonly viewportScope: string | null;
}

/** Composes map status, controls, measurement state, and the MapLibre host. */
export const MapRenderer: React.FC<MapRendererProps> = ({
  baseLayer,
  enabledStreamCount,
  errorCount,
  followEgo,
  loadingCount,
  locationEvidencePending,
  locationStreamCount,
  liveMarkers,
  onFollowEgoChange,
  onHoverTimeNs,
  onSeekTimeNs,
  playback,
  pulseActive,
  sourceKey,
  tracks,
  truncated,
  viewportScope,
}) => {
  // This effect records tile-composition commits for performance diagnostics.
  useEffect(() => {
    noteMapReactCommit("tile");
  });
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [fitRouteNonce, setFitRouteNonce] = useState(0);
  const [basemapRetryNonce, setBasemapRetryNonce] = useState(0);
  const [measureArmed, setMeasureArmed] = useState(false);
  const [measurement, setMeasurement] = useState<MapMeasurementState | null>(
    null,
  );
  const [basemapState, setBasemapState] = useState<{
    readonly baseLayer: MapBaseLayer;
    readonly status: MapBasemapStatus;
  }>(() => ({
    baseLayer,
    status: initialMapBasemapStatus(baseLayer),
  }));

  const bounds = useMemo(
    () =>
      combineLocationBounds(
        tracks.map((track) => locationBounds(track.segments)),
      ),
    [tracks],
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

  // This effect owns the Escape shortcut while map measurement is armed.
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
  const trackStatusText = mapStatusText({
    enabledStreamCount,
    errorCount,
    loadingCount,
    locationStreamCount,
    readyTrackCount: tracks.length,
    truncated,
  });
  const basemapStatus =
    basemapState.baseLayer === baseLayer
      ? basemapState.status
      : initialMapBasemapStatus(baseLayer);
  const statusText = joinMapStatusText(
    mapBasemapStatusText(basemapStatus),
    trackStatusText,
  );
  const onBasemapStatusChange = useCallback(
    (nextBaseLayer: MapBaseLayer, status: MapBasemapStatus) => {
      setBasemapState((current) =>
        current.baseLayer === nextBaseLayer && current.status === status
          ? current
          : { baseLayer: nextBaseLayer, status },
      );
    },
    [],
  );

  return (
    <div className={styles.body} data-testid="episode-map-tile">
      <MapLibreSurface
        baseLayer={baseLayer}
        basemapRetryNonce={basemapRetryNonce}
        basemapStatus={basemapStatus}
        bounds={bounds}
        fitRouteNonce={fitRouteNonce}
        followEgo={followEgo}
        locationEvidencePending={locationEvidencePending}
        liveMarkers={liveMarkers}
        measureArmed={measureArmed}
        measurement={measurement}
        onBasemapStatusChange={onBasemapStatusChange}
        onHoverTimeNs={onHoverTimeNs}
        onMeasurePick={onMeasurePick}
        onSeekTimeNs={onSeekTimeNs}
        onUserMove={() => onFollowEgoChange(false)}
        playback={playback}
        pulseActive={pulseActive}
        recenterNonce={recenterNonce}
        sourceKey={sourceKey}
        tracks={tracks}
        viewportScope={viewportScope}
      />
      <div className={styles.overlay}>
        {statusText ? (
          <span aria-live="polite" className={styles.statusBadge} role="status">
            {statusText}
          </span>
        ) : null}
        {basemapStatus === "error" ? (
          <button
            className={styles.controlButton}
            onClick={() => setBasemapRetryNonce((value) => value + 1)}
            type="button"
          >
            Retry basemap
          </button>
        ) : null}
        {tracks.length > 0 || liveMarkers.length > 0 ? (
          <button
            className={styles.controlButton}
            onClick={() => {
              if (followEgo) {
                onFollowEgoChange(false);
                setFitRouteNonce((value) => value + 1);
                return;
              }
              onFollowEgoChange(true);
              setRecenterNonce((value) => value + 1);
            }}
            type="button"
          >
            {followEgo ? "Fit route" : "Follow ego"}
          </button>
        ) : null}
      </div>
      {tracks.length > 0 ? (
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
      {tracks.length > 0 ? <MapLegend tracks={tracks} /> : null}
      <MapEmptyState
        enabledStreamCount={enabledStreamCount}
        loadingCount={loadingCount}
        locationStreamCount={locationStreamCount}
        readyTrackCount={tracks.length + liveMarkers.length}
      />
    </div>
  );
};

export default MapRenderer;
