import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useMemo, useState } from "react";
import {
  buildTileEmptyStateModel,
  buildTileStreamNotice,
  useStabilizedNotices,
} from "../status/health";
import {
  useStreamContentTimes,
  useStreamStartTimes,
  useStreamStaleAges,
  useStreamStatuses,
} from "../playback/stream-status-state";
import NoticeStrip from "../status/NoticeStrip";
import styles from "./Tile.module.css";

/** Loading gaps shorter than this should read as an atomic frame swap. */
const LOADING_INDICATOR_DELAY_MS = 200;

/**
 * Drops empty entries and keeps the array referentially stable by
 * content, so the derived status atom isn't rebuilt on every render of
 * a tile that passes an inline array.
 */
function useStableStreams(streams: readonly string[]): readonly string[] {
  const key = streams.join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes content
  return useMemo(() => streams.filter(Boolean), [key]);
}

/**
 * Corner pill layered over a tile that is showing content. Surfaces the
 * worst per-stream playback status so a seek/step that lands on missing
 * or still-loading data reads as "this stream is behind", not "the
 * modal is broken". Renders nothing while every stream is current.
 *
 * Copy and status ordering come from the unified health model in
 * `health.ts` (`buildTileStreamNotice`).
 *
 * The parent container must be `position: relative`.
 */
export const TileStatusBadge: React.FC<{
  showWarnings?: boolean;
  streams: readonly string[];
}> = ({ showWarnings = true, streams }) => {
  const stableStreams = useStableStreams(streams);
  const statuses = useStreamStatuses(stableStreams);
  const startTimes = useStreamStartTimes(stableStreams);
  const staleAges = useStreamStaleAges(stableStreams);
  const contentTimes = useStreamContentTimes(stableStreams);
  const notice = buildTileStreamNotice({
    contentTimes,
    staleAges,
    startTimes,
    statuses,
    streams: stableStreams,
  });

  if (!notice || (!showWarnings && notice.severity === "warning")) return null;

  return (
    <span
      className={clsx(styles.statusBadge, {
        [styles.statusBadgeError]: notice.status === "failed",
      })}
      data-testid="episode-tile-status-badge"
      data-status={notice.status}
      role="status"
    >
      {notice.status === "loading" && <Spinner size={Size.Xs} />}
      {notice.message}
    </span>
  );
};

/**
 * The same per-stream summary as the corner badge, rendered as the
 * tile settings' status strip: buffering, gap, stale, and failure states
 * share one model whether the user is looking at the tile or its settings.
 * The sidebar's `NoticeStrip` omits warning-severity states such as stale
 * frames so those warnings remain panel-local.
 */
export const TileStreamNoticeStrip: React.FC<{
  streams: readonly string[];
}> = ({ streams }) => {
  const stableStreams = useStableStreams(streams);
  const statuses = useStreamStatuses(stableStreams);
  const startTimes = useStreamStartTimes(stableStreams);
  const staleAges = useStreamStaleAges(stableStreams);
  const contentTimes = useStreamContentTimes(stableStreams);
  const notice = buildTileStreamNotice({
    contentTimes,
    staleAges,
    startTimes,
    statuses,
    streams: stableStreams,
  });
  const notices = useStabilizedNotices(notice ? [notice] : []);

  return <NoticeStrip notices={notices} />;
};

/**
 * Full-area placeholder for a tile with no content to show yet. Picks
 * the message from the streams' playback statuses instead of spinning
 * forever: a spinner only while data is actually loading, otherwise an
 * explicit "no data" / "failed" message — with the stream's start time
 * when it is known ("No data until 0:12"). A tile with no usable streams
 * gets a deterministic "no source" message rather than an infinite
 * spinner — before any playback-store hook runs, so sourceless tiles
 * don't require a surrounding PlaybackProvider.
 */
export const TileEmptyState: React.FC<{
  streams: readonly string[];
}> = ({ streams }) => {
  const stableStreams = useStableStreams(streams);

  if (stableStreams.length === 0) {
    return (
      <div className={styles.loading} data-testid="episode-tile-empty-state">
        <span className={clsx(styles.emptyText, styles.emptyTextError)}>
          No source available
        </span>
      </div>
    );
  }

  return <TileEmptyStateForStreams streams={stableStreams} />;
};

const TileEmptyStateForStreams: React.FC<{
  streams: readonly string[];
}> = ({ streams }) => {
  const statuses = useStreamStatuses(streams);
  const startTimes = useStreamStartTimes(streams);
  const model = buildTileEmptyStateModel({ startTimes, statuses });

  return (
    <div className={styles.loading} data-testid="episode-tile-empty-state">
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
      data-testid="episode-tile-loading-indicator"
      data-visible={visible || undefined}
    >
      {visible ? <Spinner size={Size.Lg} /> : null}
    </span>
  );
}
