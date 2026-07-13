import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useMemo, useState } from "react";
import {
  buildMcapTileEmptyStateModel,
  buildMcapTileStreamNotice,
} from "./mcap-health";
import {
  useMcapTopicStartTimes,
  useMcapTopicStaleAges,
  useMcapTopicStatuses,
} from "./mcap-stream-status-state";
import McapNoticeStrip from "./McapNoticeStrip";
import styles from "./McapTile.module.css";

/** Loading gaps shorter than this should read as an atomic frame swap. */
const LOADING_INDICATOR_DELAY_MS = 200;

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
 * Copy and status ordering come from the unified health model in
 * `mcap-health.ts` (`buildMcapTileStreamNotice`).
 *
 * The parent container must be `position: relative`.
 */
export const McapTileStatusBadge: React.FC<{
  topics: readonly string[];
}> = ({ topics }) => {
  const stableTopics = useStableTopics(topics);
  const statuses = useMcapTopicStatuses(stableTopics);
  const startTimes = useMcapTopicStartTimes(stableTopics);
  const staleAges = useMcapTopicStaleAges(stableTopics);
  const notice = buildMcapTileStreamNotice({ staleAges, startTimes, statuses });

  if (!notice) return null;

  return (
    <span
      className={clsx(styles.statusBadge, {
        [styles.statusBadgeError]: notice.status === "failed",
      })}
      data-testid="mcap-tile-status-badge"
      data-status={notice.status}
      role="status"
    >
      {notice.status === "loading" && <Spinner size={Size.Xs} />}
      {notice.message}
    </span>
  );
};

/**
 * The same per-topic stream summary as the corner badge, rendered as the
 * tile settings' status strip: buffering, gap, stale, and failure states
 * read identically whether the user is looking at the tile or its
 * settings. Renders nothing while every topic is current.
 */
export const McapTileStreamNoticeStrip: React.FC<{
  topics: readonly string[];
}> = ({ topics }) => {
  const stableTopics = useStableTopics(topics);
  const statuses = useMcapTopicStatuses(stableTopics);
  const startTimes = useMcapTopicStartTimes(stableTopics);
  const staleAges = useMcapTopicStaleAges(stableTopics);
  const notice = buildMcapTileStreamNotice({ staleAges, startTimes, statuses });

  return <McapNoticeStrip notices={notice ? [notice] : []} />;
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
  const model = buildMcapTileEmptyStateModel({ startTimes, statuses });

  return (
    <div className={styles.loading} data-testid="mcap-tile-empty-state">
      {model.kind === "failed" ? (
        <span className={clsx(styles.emptyText, styles.emptyTextError)}>
          {model.message}
        </span>
      ) : model.kind === "loading" ? (
        <DelayedLoadingIndicator />
      ) : (
        <span className={styles.emptyText}>{model.message}</span>
      )}
    </div>
  );
};

function DelayedLoadingIndicator() {
  const [visible, setVisible] = useState(false);

  // This effect suppresses loading chrome for transitions shorter than the delay.
  useEffect(() => {
    const timer = setTimeout(
      () => setVisible(true),
      LOADING_INDICATOR_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  return (
    <span
      data-testid="mcap-tile-loading-indicator"
      data-visible={visible || undefined}
    >
      {visible ? <Spinner size={Size.Lg} /> : null}
    </span>
  );
}
