import React from "react";

import {
  combineLocationBounds,
  locationBounds,
  type LocationTrackState,
} from "../tracks/location-track";
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
          title={track.stream}
        >
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

/** Lightweight route preview shown while the interactive basemap is absent. */
export function StaticMapPreview({
  tracks,
}: {
  readonly tracks: readonly LocationTrackState[];
}) {
  const bounds = combineLocationBounds(
    tracks.map((track) => locationBounds(track.segments)),
  );
  const project = (longitude: number, latitude: number): [number, number] => {
    if (!bounds) return [50, 50];
    const width = Math.max(bounds.east - bounds.west, 0.000001);
    const height = Math.max(bounds.north - bounds.south, 0.000001);
    const x = ((longitude - bounds.west) / width) * 92 + 4;
    const y = 96 - ((latitude - bounds.south) / height) * 92;
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
    </svg>
  );
}
