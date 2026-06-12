import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useMemo } from "react";
import styles from "./McapTile.module.css";
import {
  useMcapTopicStatuses,
  type McapTopicStatus,
} from "./mcap-stream-status";

interface StatusSummary {
  /** Number of topics currently in `status`. */
  readonly affected: number;
  readonly status: Exclude<McapTopicStatus, "ready">;
  readonly total: number;
}

/**
 * Worst non-ready status across the tile's topics, severity-ordered:
 * a sticky failure outranks transient buffering, which outranks a data
 * gap. `null` when every topic is current.
 */
function summarizeStatuses(
  statuses: readonly McapTopicStatus[]
): StatusSummary | null {
  for (const status of ["failed", "loading", "gap"] as const) {
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
        `No data at this time${affectedSuffix(summary)}`}
      {summary.status === "failed" &&
        `Failed to load${affectedSuffix(summary)}`}
    </span>
  );
};

/**
 * Full-area placeholder for a tile with no content to show yet. Picks
 * the message from the topics' playback statuses instead of spinning
 * forever: a spinner only while data is actually loading, otherwise an
 * explicit "no data" / "failed" message. A tile with no usable topics
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
        <span className={styles.emptyText}>No data at this time</span>
      )}
    </div>
  );
};
