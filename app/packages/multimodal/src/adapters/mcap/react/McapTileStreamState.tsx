import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo } from "react";
import styles from "./McapTile.module.css";
import {
  McapTopicStatus,
  useMcapTopicStartTimes,
  useMcapTopicStatuses,
} from "./mcap-stream-status-state";

interface StatusSummary {
  /** Number of topics currently in `status`. */
  readonly affected: number;
  readonly status: Exclude<McapTopicStatus, "ready">;
  readonly total: number;
}

/**
 * Worst non-ready status across the tile's topics, severity-ordered: a
 * sticky failure outranks transient buffering, which outranks a
 * pre-start gap, which outranks a stale-but-rendering frame. `null`
 * when every topic is current.
 */
function summarizeStatuses(
  statuses: readonly McapTopicStatus[]
): StatusSummary | null {
  for (const status of ["failed", "loading", "gap", "stale"] as const) {
    const affected = statuses.filter((s) => s === status).length;
    if (affected > 0) {
      return { affected, status, total: statuses.length };
    }
  }
  return null;
}

/** `(k/n)` suffix so a multi-source tile says how much of it is behind. */
function affectedSuffix({ affected, total }: StatusSummary): string {
  return total > 1 ? ` (${affected}/${total})` : "";
}

/**
 * Timeline seconds → `m:ss.cs` for "No data until" copy — the same
 * shape as the playhead readout, so sub-second starts don't collapse
 * into a nonsensical "until 0:00" while the playhead sits at 0:00.
 */
function formatStartTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const totalCs = Math.floor(safe * 100);
  const m = Math.floor(totalCs / 6000);
  const s = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/**
 * Earliest known first-message time among the topics currently in
 * "gap", or null when none is known. With latest-at-or-before
 * selection, a gap means the playhead is before the topic's first
 * message — the earliest start is when the tile gets content.
 */
function earliestGapStartSec(
  statuses: readonly McapTopicStatus[],
  startTimes: readonly (number | null)[]
): number | null {
  let earliest: number | null = null;
  statuses.forEach((status, index) => {
    if (status !== "gap") return;
    const start = startTimes[index];
    if (start === null || start === undefined) return;
    if (earliest === null || start < earliest) earliest = start;
  });
  return earliest;
}

function gapCopy(startSec: number | null): string {
  return startSec !== null
    ? `No data until ${formatStartTime(startSec)}`
    : "No data at this time";
}

/**
 * Drops empty entries and keeps the array referentially stable by
 * content, so the derived status atom isn't rebuilt on every render of
 * a tile that passes an inline array.
 */
function useStableTopics(topics: readonly string[]): readonly string[] {
  const key = topics.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes content
  return useMemo(() => topics.filter(Boolean), [key]);
}

/**
 * Corner pill layered over a tile that is showing content. Surfaces the
 * worst per-topic playback status so a seek/step that lands on missing
 * or still-loading data reads as "this stream is behind", not "the
 * modal is broken". Renders nothing while every stream is current.
 *
 * The parent container must be `position: relative`.
 */
export const McapTileStatusBadge: React.FC<{
  topics: readonly string[];
}> = ({ topics }) => {
  const stableTopics = useStableTopics(topics);
  const statuses = useMcapTopicStatuses(stableTopics);
  const startTimes = useMcapTopicStartTimes(stableTopics);
  const summary = summarizeStatuses(statuses);

  if (!summary) return null;

  return (
    <span
      className={clsx(styles.statusBadge, {
        [styles.statusBadgeError]: summary.status === "failed",
      })}
      data-testid="mcap-tile-status-badge"
      data-status={summary.status}
      role="status"
    >
      {summary.status === "loading" && (
        <>
          <Spinner size={Size.Xs} />
          {`Buffering${affectedSuffix(summary)}`}
        </>
      )}
      {summary.status === "gap" &&
        `${gapCopy(earliestGapStartSec(statuses, startTimes))}${affectedSuffix(
          summary
        )}`}
      {summary.status === "stale" && `No new data${affectedSuffix(summary)}`}
      {summary.status === "failed" &&
        `Failed to load${affectedSuffix(summary)}`}
    </span>
  );
};

/**
 * Full-area placeholder for a tile with no content to show yet. Picks
 * the message from the topics' playback statuses instead of spinning
 * forever: a spinner only while data is actually loading, otherwise an
 * explicit "no data" / "failed" message — with the stream's start time
 * when it is known ("No data until 0:12"). A tile with no usable topics
 * gets a deterministic "no source" message rather than an infinite
 * spinner — before any playback-store hook runs, so sourceless tiles
 * don't require a surrounding PlaybackProvider.
 */
export const McapTileEmptyState: React.FC<{
  topics: readonly string[];
}> = ({ topics }) => {
  const stableTopics = useStableTopics(topics);

  if (stableTopics.length === 0) {
    return (
      <div className={styles.loading} data-testid="mcap-tile-empty-state">
        <span className={clsx(styles.emptyText, styles.emptyTextError)}>
          No source available
        </span>
      </div>
    );
  }

  return <McapTileEmptyStateForTopics topics={stableTopics} />;
};

const McapTileEmptyStateForTopics: React.FC<{
  topics: readonly string[];
}> = ({ topics }) => {
  const statuses = useMcapTopicStatuses(topics);
  const startTimes = useMcapTopicStartTimes(topics);
  const allFailed =
    statuses.length > 0 && statuses.every((s) => s === "failed");
  const anyLoading = statuses.some((s) => s === "loading");

  return (
    <div className={styles.loading} data-testid="mcap-tile-empty-state">
      {allFailed ? (
        <span className={clsx(styles.emptyText, styles.emptyTextError)}>
          Failed to load stream data
        </span>
      ) : anyLoading ? (
        <Spinner size={Size.Lg} />
      ) : (
        <span className={styles.emptyText}>
          {gapCopy(earliestGapStartSec(statuses, startTimes))}
        </span>
      )}
    </div>
  );
};
