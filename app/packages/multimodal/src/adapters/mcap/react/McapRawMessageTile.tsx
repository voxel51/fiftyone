import { humanReadableBytes } from "@fiftyone/utilities";
import { useSetTileTitle } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { rawNodeToJson } from "../resources/raw-record-prune";
import type { McapRawMessageRecordResult } from "../types";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { useMcapRawMessageContext } from "./mcap-raw-message-context";
import { useMcapRawTileTopic } from "./mcap-raw-tile-state";
import type { McapTileProps } from "./mcap-tile-types";
import McapRawMessageTree from "./McapRawMessageTree";
import rawStyles from "./McapRawMessageTile.module.css";
import McapRawMessageTileSettings from "./McapRawMessageTileSettings";
import styles from "./McapTile.module.css";

const COPY_FEEDBACK_MS = 1200;

/**
 * Raw message tile: the escape hatch that makes every topic at least
 * inspectable. Shows the selected topic's newest message at the
 * playhead as a collapsible record tree; topics without a generic
 * decode path (cbor, ros1) degrade to legible metadata instead of
 * silence. Topic selection lives in the per-tile raw state and the
 * settings sidebar; records come from the shared raw-message cache
 * (playhead-anchored, idle lane).
 */
const McapRawMessageTile: React.FC<McapTileProps> = () => {
  const topic = useMcapRawTileTopic();
  const setTileTitle = useSetTileTitle();
  const { recordsByTopic, subscribeRecord } = useMcapRawMessageContext();

  // This effect declares interest in the selected topic while the tile
  // shows it; the bridge follows the playhead for interested topics.
  useEffect(() => {
    if (!topic) {
      return undefined;
    }
    return subscribeRecord(topic);
  }, [subscribeRecord, topic]);

  useEffect(() => {
    setTileTitle(topic ?? "Message", { source: "auto" });
  }, [setTileTitle, topic]);

  const state = topic ? recordsByTopic.get(topic) : undefined;
  const result = state?.result;

  return (
    <>
      <McapRawMessageTileSettings />
      <div className={rawStyles.body} data-cy="mcap-raw-tile">
        {!topic ? (
          <div className={styles.loading}>
            <span className={styles.emptyText}>
              Choose a topic in the panel settings
            </span>
          </div>
        ) : !result ? (
          <div className={styles.loading}>
            <span
              className={
                state?.status === "error"
                  ? styles.emptyTextError
                  : styles.emptyText
              }
            >
              {state?.status === "error"
                ? `Could not read ${topic}: ${state.error ?? "unknown error"}`
                : "Loading message…"}
            </span>
          </div>
        ) : (
          <>
            <MetaRow result={result} topic={topic} />
            <RecordBody result={result} />
          </>
        )}
      </div>
    </>
  );
};

function MetaRow({
  result,
  topic,
}: {
  readonly result: McapRawMessageRecordResult;
  readonly topic: string;
}) {
  const dataStream = useMcapDataStream();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // This effect clears a pending copy-feedback timer on unmount.
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const handleCopyMessage = useCallback(() => {
    if (!result.root) {
      return;
    }
    void navigator.clipboard?.writeText(
      JSON.stringify(rawNodeToJson(result.root), null, 2),
    );
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(
      () => setCopied(false),
      COPY_FEEDBACK_MS,
    );
  }, [result.root]);

  const startTimeNs = dataStream?.getTimelineIndex()?.startTimeNs;
  const relativeTime =
    result.logTimeNs !== undefined && startTimeNs !== undefined
      ? formatRelativeSeconds(result.logTimeNs, startTimeNs)
      : null;

  return (
    <div className={rawStyles.meta} data-cy="mcap-raw-meta">
      <span className={rawStyles.metaTopic}>{topic}</span>
      {relativeTime ? (
        <span title="Message log time relative to the recording start">
          {relativeTime}
        </span>
      ) : null}
      {result.sequence !== undefined ? (
        <span title="Message sequence number">seq {result.sequence}</span>
      ) : null}
      {result.encodedPayloadBytes !== undefined ? (
        <span title="Encoded payload size">
          {humanReadableBytes(result.encodedPayloadBytes)}
        </span>
      ) : null}
      {result.schemaName ? (
        <span className={rawStyles.metaBadge} title="Schema">
          {result.schemaName}
        </span>
      ) : null}
      <span className={rawStyles.metaBadge} title="Message encoding">
        {result.messageEncoding}
      </span>
      {result.truncated ? (
        <span
          className={rawStyles.metaBadge}
          title="Large fields are shortened for display; copies carry the same shortened data"
        >
          truncated
        </span>
      ) : null}
      {result.root ? (
        <button
          className={rawStyles.copyMessageButton}
          data-cy="mcap-raw-copy-message"
          onClick={handleCopyMessage}
          title="Copy the whole message as JSON"
          type="button"
        >
          {copied ? "Copied" : "Copy message"}
        </button>
      ) : null}
    </div>
  );
}

function RecordBody({
  result,
}: {
  readonly result: McapRawMessageRecordResult;
}) {
  if (result.status === "ok" && result.root) {
    return (
      <div className={rawStyles.scroll}>
        <McapRawMessageTree root={result.root} />
      </div>
    );
  }

  return (
    <div className={styles.loading}>
      <span className={rawStyles.notice} data-cy="mcap-raw-notice">
        {noticeText(result)}
      </span>
    </div>
  );
}

function noticeText(result: McapRawMessageRecordResult): string {
  switch (result.status) {
    case "empty":
      return "No message at or before the playhead on this topic";
    case "unsupported":
      return `'${result.messageEncoding}' messages can't be decoded yet — showing message metadata only`;
    case "decode-error":
      return `This message failed to decode${
        result.decodeError ? `: ${result.decodeError}` : ""
      }`;
    default:
      return "No decoded payload for this message";
  }
}

function formatRelativeSeconds(logTimeNs: bigint, startTimeNs: bigint): string {
  const deltaNs = logTimeNs - startTimeNs;
  const negative = deltaNs < 0n;
  const magnitude = negative ? -deltaNs : deltaNs;
  const wholeSeconds = magnitude / 1_000_000_000n;
  const millis = (magnitude % 1_000_000_000n) / 1_000_000n;
  return `t=${negative ? "-" : "+"}${wholeSeconds.toString()}.${millis
    .toString()
    .padStart(3, "0")}s`;
}

export default McapRawMessageTile;
