import { humanReadableBytes } from "@fiftyone/utilities";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { McapRawMessageRecordResult } from "../types";
import { useAddMcapFieldToPlot } from "./use-add-mcap-field-to-plot";
import { useMcapDataStream } from "./mcap-data-stream-context";
import { useMcapNumericSeriesContext } from "./mcap-numeric-series-context";
import { useMcapRawMessageContext } from "./mcap-raw-message-context";
import { useMcapRawTileTopic } from "./mcap-raw-tile-state";
import type { McapTileProps } from "./mcap-tile-types";
import McapRawMessageTree from "./McapRawMessageTree";
import rawStyles from "./McapRawMessageTile.module.css";
import McapRawMessageTileSettings from "./McapRawMessageTileSettings";
import { useRegisterMcapTileSettings } from "./mcap-tile-settings-context";
import styles from "./McapTile.module.css";
import { useCopyFeedback } from "./use-copy-feedback";

/**
 * Raw message tile: the escape hatch that makes every topic at least
 * inspectable. Shows the selected topic's newest message at the
 * playhead as a collapsible record tree; topics without a generic
 * decode path or usable schema degrade to legible metadata instead of
 * silence. Topic selection lives in the per-tile raw state and the
 * settings sidebar; records come from the shared raw-message cache
 * (playhead-anchored, idle lane).
 */
const McapRawMessageTile: React.FC<McapTileProps> = () => {
  const tileId = useTileId();
  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <McapRawMessageTileSettings /> }),
    [],
  );
  useRegisterMcapTileSettings(tileId, settingsRegistration);
  const topic = useMcapRawTileTopic();
  const setTileTitle = useSetTileTitle();
  const { recordsByTopic, subscribeRecord } = useMcapRawMessageContext();
  const { ensureEnumeration, enumeration } = useMcapNumericSeriesContext();
  const addFieldToPlot = useAddMcapFieldToPlot();

  // This effect declares interest in the selected topic while the tile
  // shows it; the bridge follows the playhead for interested topics.
  useEffect(() => {
    if (!topic) {
      return undefined;
    }
    return subscribeRecord(topic);
  }, [subscribeRecord, topic]);

  // The raw tree only shows "plot" on fields confirmed by the numeric
  // catalog. While the catalog is idle/loading/error, no affordance is shown.
  useEffect(() => {
    if (topic) {
      ensureEnumeration();
    }
  }, [ensureEnumeration, topic]);

  // This effect keeps the tile title synchronized with the selected topic.
  useEffect(() => {
    setTileTitle(topic ?? "Message", { source: "auto" });
  }, [setTileTitle, topic]);

  const state = topic ? recordsByTopic.get(topic) : undefined;
  const result = state?.result;
  const plottableFieldPaths = useMemo(() => {
    if (!topic || enumeration.status !== "ready") {
      return undefined;
    }
    const topicFields = enumeration.topics.find(
      (entry) => entry.topic === topic && entry.availability === "ready",
    );
    if (!topicFields || topicFields.fields.length === 0) {
      return undefined;
    }
    return new Set(topicFields.fields.map((field) => field.path));
  }, [enumeration, topic]);

  const handleAddFieldToPlot = useCallback(
    (fieldPath: string) => {
      if (topic) {
        addFieldToPlot(topic, fieldPath);
      }
    },
    [addFieldToPlot, topic],
  );

  return (
    <>
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
            <RecordBody
              onAddNumericFieldToPlot={handleAddFieldToPlot}
              plottableFieldPaths={plottableFieldPaths}
              result={result}
            />
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
  const { readFullMessageJson } = useMcapRawMessageContext();
  const [copying, setCopying] = useState(false);
  const [copyFeedback, showCopyFeedback] = useCopyFeedback<
    "idle" | "copied" | "failed"
  >("idle");

  const handleCopyMessage = useCallback(async () => {
    if (!result.root || copying) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showCopyFeedback("failed");
      return;
    }

    setCopying(true);
    try {
      const json = await readFullMessageJson(topic, result.validFromNs);
      await navigator.clipboard.writeText(json);
      showCopyFeedback("copied");
    } catch {
      showCopyFeedback("failed");
    } finally {
      setCopying(false);
    }
  }, [copying, readFullMessageJson, result, showCopyFeedback, topic]);

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
          title="Large fields are shortened for display; Copy message retrieves the complete decoded message"
        >
          truncated
        </span>
      ) : null}
      {result.root ? (
        <button
          className={rawStyles.copyMessageButton}
          data-cy="mcap-raw-copy-message"
          disabled={copying}
          onClick={() => void handleCopyMessage()}
          title="Copy the whole message as JSON"
          type="button"
        >
          {copying
            ? "Copying…"
            : copyFeedback === "copied"
              ? "Copied"
              : copyFeedback === "failed"
                ? "Copy failed"
                : "Copy message"}
        </button>
      ) : null}
    </div>
  );
}

function RecordBody({
  onAddNumericFieldToPlot,
  plottableFieldPaths,
  result,
}: {
  readonly onAddNumericFieldToPlot: (path: string) => void;
  readonly plottableFieldPaths?: ReadonlySet<string>;
  readonly result: McapRawMessageRecordResult;
}) {
  if (result.status === "ok" && result.root) {
    return (
      <div className={rawStyles.scroll}>
        <McapRawMessageTree
          onAddNumericFieldToPlot={onAddNumericFieldToPlot}
          plottableFieldPaths={plottableFieldPaths}
          root={result.root}
        />
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
      if (result.decodeUnavailableReason === "schema-unavailable") {
        return `'${result.messageEncoding}' messages need a readable schema to decode — showing message metadata only`;
      }
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
