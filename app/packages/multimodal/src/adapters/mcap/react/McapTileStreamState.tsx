import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React from "react";
import styles from "./McapTile.module.css";
import { useMcapTopicStatus } from "./mcap-stream-status";

/**
 * Corner pill layered over a tile that is showing a frame. Surfaces the
 * per-topic playback status so a seek/step that lands on missing or
 * still-loading data reads as "this stream is behind", not "the modal is
 * broken". Renders nothing while the stream is current.
 *
 * The parent container must be `position: relative`.
 */
export const McapTileStatusBadge: React.FC<{ topic: string }> = ({ topic }) => {
  const status = useMcapTopicStatus(topic);

  if (!topic || status === "ready") return null;

  return (
    <span
      className={clsx(styles.statusBadge, {
        [styles.statusBadgeError]: status === "failed",
      })}
      data-testid="mcap-tile-status-badge"
      data-status={status}
      role="status"
    >
      {status === "loading" && (
        <>
          <Spinner size={Size.Xs} />
          Buffering
        </>
      )}
      {status === "gap" && "No data at this time"}
      {status === "failed" && "Failed to load"}
    </span>
  );
};

/**
 * Full-area placeholder for a tile with no frame to show yet. Picks the
 * message from the topic's playback status instead of spinning forever:
 * a spinner only while data is actually loading, otherwise an explicit
 * "no data" / "failed" message.
 */
export const McapTileEmptyState: React.FC<{ topic: string }> = ({ topic }) => {
  const status = useMcapTopicStatus(topic);

  return (
    <div className={styles.loading} data-testid="mcap-tile-empty-state">
      {status === "failed" ? (
        <span className={clsx(styles.emptyText, styles.emptyTextError)}>
          Failed to load stream data
        </span>
      ) : status === "gap" ? (
        <span className={styles.emptyText}>No data at this time</span>
      ) : (
        <Spinner size={Size.Lg} />
      )}
    </div>
  );
};
