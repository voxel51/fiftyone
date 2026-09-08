import React from "react";

import {
  combineLocationBounds,
  locationBounds,
  type LocationTrackState,
} from "../tracks/location-track";
import type { MapLocationMarker } from "./playback-paint";
import { unwrapLongitude } from "../wgs84";
import styles from "./MapRenderer.module.css";

/** Legend for the currently rendered location tracks. */
export function MapLegend({
  tracks,
}: {
  readonly tracks: readonly LocationTrackState[];
}) {
  return (
    <div className={styles.legend}>
      {tracks.map((track) => (
        <div
          className={styles.legendRow}
          key={track.stream}
          title={track.sourceName}
        >
          <span
            className={styles.legendSwatch}
            style={{ backgroundColor: track.color }}
          />
          <span className={styles.legendLabel}>{track.label}</span>
          <span className={styles.legendMeta}>
            {track.pointCount.toLocaleString()}{" "}
            {track.pointCount === 1 ? "point" : "points"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Lightweight route preview shown while the interactive basemap is absent. */
export function StaticMapPreview({
  liveMarkers = [],
  tracks,
}: {
  readonly liveMarkers?: readonly MapLocationMarker[];
  readonly tracks: readonly LocationTrackState[];
}) {
  const bounds = combineLocationBounds([
    ...tracks.map((track) => locationBounds(track.segments)),
    ...liveMarkers.map(({ location }) => ({
      east: location.longitude,
      north: location.latitude,
      south: location.latitude,
      west: location.longitude,
    })),
  ]);
  const project = (longitude: number, latitude: number): [number, number] => {
    if (!bounds) return [50, 50];
    const width = bounds.east - bounds.west;
    const height = bounds.north - bounds.south;
    const continuousLongitude =
      width <= 180
        ? unwrapLongitude(longitude, (bounds.west + bounds.east) / 2)
        : longitude;
    const x =
      width > 0.000001
        ? ((continuousLongitude - bounds.west) / width) * 92 + 4
        : 50;
    const y =
      height > 0.000001 ? 96 - ((latitude - bounds.south) / height) * 92 : 50;
    return [x, y];
  };

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
              key={`${track.stream}:${segmentIndex}`}
              points={points}
              stroke={track.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="0.7"
            />
          );
        }),
      )}
      {liveMarkers.map((marker) => {
        const [x, y] = project(
          marker.location.longitude,
          marker.location.latitude,
        );
        return (
          <circle
            cx={x}
            cy={y}
            fill={marker.color}
            key={marker.stream}
            r="1.8"
            stroke="#f8fafc"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}
