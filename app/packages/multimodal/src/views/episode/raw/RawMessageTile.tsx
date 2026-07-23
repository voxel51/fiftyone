import { humanReadableBytes } from "@fiftyone/utilities";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { RawRecordResult } from "../../../ir";
import { useDataStream } from "../playback/data-stream-context";
import { useAddFieldToPlot } from "../plots/use-add-field-to-plot";
import { useNumericSeriesContext } from "../plots/numeric-series-context";
import { useRawMessageContext } from "./raw-message-context";
import { useRawTileStream } from "../tiles/raw-message-binding";
import type { EpisodeTileProps } from "../tiles/tile-types";
import StructuredMessageTree from "../../../visualization/message/StructuredMessageTree";
import rawStyles from "../../../visualization/message/StructuredMessage.module.css";
import RawMessageTileSettings from "./RawMessageTileSettings";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import styles from "../tiles/Tile.module.css";
import { useCopyFeedback } from "../../../visualization/panel-ui/use-copy-feedback";

/**
 * Raw message tile: the escape hatch that makes every stream at least
 * inspectable. Shows the selected stream's newest message at the
 * playhead as a collapsible record tree; streams without a generic
 * decode path or usable schema degrade to legible metadata instead of
 * silence. Stream selection lives in the per-tile raw state and the
 * settings sidebar; records come from the shared raw-message cache
 * (playhead-anchored, idle lane).
 */
const RawMessageTile: React.FC<EpisodeTileProps> = () => {
  const tileId = useTileId();
  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <RawMessageTileSettings /> }),
    [],
  );
  useRegisterTileSettings(tileId, settingsRegistration);
  const streamKey = useRawTileStream();
  const setTileTitle = useSetTileTitle();
  const { recordsByStream, subscribeRecord } = useRawMessageContext();
  const { ensureEnumeration, enumeration } = useNumericSeriesContext();
  const addFieldToPlot = useAddFieldToPlot();

  // This effect declares interest in the selected stream while the tile
  // shows it; the bridge follows the playhead for interested streams.
  useEffect(() => {
    if (!streamKey) {
      return undefined;
    }
    return subscribeRecord(streamKey);
  }, [streamKey, subscribeRecord]);

  // The raw tree only shows "plot" on fields confirmed by the numeric
  // catalog. While the catalog is idle/loading/error, no affordance is shown.
  useEffect(() => {
    if (streamKey) {
      ensureEnumeration();
    }
  }, [ensureEnumeration, streamKey]);

  const state = streamKey ? recordsByStream.get(streamKey) : undefined;
  const result = state?.result;

  // Keep canonical ids in tile state, but present the source name returned by
  // the adapter. While a record is loading, preserve the title assigned by the
  // stream action or picker instead of flashing an internal channel id.
  useEffect(() => {
    if (!streamKey) {
      setTileTitle("Message", { source: "auto" });
    } else if (result?.sourceName) {
      setTileTitle(result.sourceName, { source: "auto" });
    }
  }, [result?.sourceName, setTileTitle, streamKey]);

  const plottableFieldPaths = useMemo(() => {
    if (!streamKey || enumeration.status !== "ready") {
      return undefined;
    }
    const streamFields = enumeration.streams.find(
      (entry) =>
        (entry.streamId === streamKey || entry.sourceName === streamKey) &&
        entry.availability === "ready",
    );
    if (!streamFields || streamFields.fields.length === 0) {
      return undefined;
    }
    return new Set(streamFields.fields.map((field) => field.path));
  }, [enumeration, streamKey]);

  const handleAddFieldToPlot = useCallback(
    (fieldPath: string) => {
      if (streamKey) {
        addFieldToPlot(streamKey, fieldPath);
      }
    },
    [addFieldToPlot, streamKey],
  );

  return (
    <div className={rawStyles.body} data-cy="episode-raw-tile">
      {!streamKey ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>
            Choose a stream in the panel settings
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
              ? `Could not read ${streamKey}: ${state.error ?? "unknown error"}`
              : "Loading message…"}
          </span>
        </div>
      ) : (
        <>
          <MetaRow result={result} streamKey={streamKey} />
          <RecordBody
            onAddNumericFieldToPlot={handleAddFieldToPlot}
            plottableFieldPaths={plottableFieldPaths}
            result={result}
          />
        </>
      )}
    </div>
  );
};

function MetaRow({
  result,
  streamKey,
}: {
  readonly result: RawRecordResult;
  readonly streamKey: string;
}) {
  const dataStream = useDataStream();
  const { readFullMessageJson } = useRawMessageContext();
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
      const json = await readFullMessageJson(streamKey, result.validFromNs);
      await navigator.clipboard.writeText(json);
      showCopyFeedback("copied");
    } catch {
      showCopyFeedback("failed");
    } finally {
      setCopying(false);
    }
  }, [copying, readFullMessageJson, result, showCopyFeedback, streamKey]);

  const startTimeNs = dataStream?.getTimelineIndex()?.startTimeNs;
  const relativeTime =
    result.timestampNs !== undefined && startTimeNs !== undefined
      ? formatRelativeSeconds(result.timestampNs, startTimeNs)
      : null;

  return (
    <div className={rawStyles.meta} data-cy="episode-raw-meta">
      <span className={rawStyles.metaStream}>{result.sourceName}</span>
      {relativeTime ? (
        <span title="Message log time relative to the recording start">
          {relativeTime}
        </span>
      ) : null}
      {result.sequence !== undefined ? (
        <span title="Message sequence number">seq {result.sequence}</span>
      ) : null}
      {result.payloadBytes !== undefined ? (
        <span title="Encoded payload size">
          {humanReadableBytes(result.payloadBytes)}
        </span>
      ) : null}
      {result.schemaName ? (
        <span className={rawStyles.metaBadge} title="Schema">
          {result.schemaName}
        </span>
      ) : null}
      <span className={rawStyles.metaBadge} title="Message encoding">
        {result.encoding}
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
          data-cy="episode-raw-copy-message"
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
  readonly result: RawRecordResult;
}) {
  if (result.status === "ok" && result.root) {
    return (
      <div className={rawStyles.scroll}>
        <StructuredMessageTree
          onAddNumericFieldToPlot={onAddNumericFieldToPlot}
          plottableFieldPaths={plottableFieldPaths}
          root={result.root}
        />
      </div>
    );
  }

  return (
    <div className={styles.loading}>
      <span className={rawStyles.notice} data-cy="episode-raw-notice">
        {noticeText(result)}
      </span>
    </div>
  );
}

function noticeText(result: RawRecordResult): string {
  switch (result.status) {
    case "empty":
      return "No message at or before the playhead on this stream";
    case "unsupported":
      if (result.decodeUnavailableReason === "schema-unavailable") {
        return `'${result.encoding}' messages need a readable schema to decode — showing message metadata only`;
      }
      return `'${result.encoding}' messages can't be decoded yet — showing message metadata only`;
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

export default RawMessageTile;
