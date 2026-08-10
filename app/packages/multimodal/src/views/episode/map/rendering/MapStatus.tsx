import React from "react";

import styles from "./MapRenderer.module.css";

/** Summarizes actionable per-stream failure and route-fidelity state. */
export function mapStatusText({
  downsampled,
  enabledStreamCount,
  errorCount,
  locationStreamCount,
  readyTrackCount,
  truncated,
}: {
  readonly downsampled: boolean;
  readonly enabledStreamCount: number;
  readonly errorCount: number;
  readonly locationStreamCount: number;
  readonly readyTrackCount: number;
  readonly truncated: boolean;
}): string | null {
  if (locationStreamCount === 0 || enabledStreamCount === 0) return null;
  const notes = [
    errorCount > 0 ? `${errorCount} failed` : null,
    readyTrackCount > 0 && truncated ? "partial route" : null,
    readyTrackCount > 0 && downsampled ? "downsampled" : null,
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(" · ") : null;
}

/** Joins present map status fragments in display order. */
export function joinMapStatusText(
  ...parts: readonly (string | null)[]
): string | null {
  const status = parts.filter((part): part is string => Boolean(part));
  return status.length > 0 ? status.join(" · ") : null;
}

/** Renders the actionable empty state for the current GPS selection. */
export function MapEmptyState({
  enabledStreamCount,
  loadingCount,
  locationStreamCount,
  readyTrackCount,
}: {
  readonly enabledStreamCount: number;
  readonly loadingCount: number;
  readonly locationStreamCount: number;
  readonly readyTrackCount: number;
}): React.ReactElement | null {
  let text: string | null = null;
  if (locationStreamCount === 0) {
    text = "No GPS streams in this recording";
  } else if (enabledStreamCount === 0) {
    text = "All GPS streams are hidden";
  } else if (readyTrackCount === 0 && loadingCount === 0) {
    text = "No valid GPS fixes to render";
  }
  return text ? <div className={styles.emptyState}>{text}</div> : null;
}
