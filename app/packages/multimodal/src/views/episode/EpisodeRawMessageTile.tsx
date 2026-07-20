import { humanReadableBytes } from "@fiftyone/utilities";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { RawRecordResult } from "../../ir";
import { useEpisodeDataStream } from "../../runtime";
import { useAddEpisodeFieldToPlot } from "./use-add-episode-field-to-plot";
import { useEpisodeNumericSeriesContext } from "./episode-numeric-series-context";
import { useEpisodeRawMessageContext } from "./episode-raw-message-context";
import { useEpisodeRawTileStream } from "./episode-raw-tile-state";
import type { EpisodeTileProps } from "./episode-tile-types";
import EpisodeRawMessageTree from "./EpisodeRawMessageTree";
import rawStyles from "./EpisodeRawMessageTile.module.css";
import EpisodeRawMessageTileSettings from "./EpisodeRawMessageTileSettings";
import { useRegisterEpisodeTileSettings } from "./episode-tile-settings-context";
import styles from "./EpisodeTile.module.css";
import { useCopyFeedback } from "./use-copy-feedback";

/**
 * Raw message tile: the escape hatch that makes every stream at least
 * inspectable. Shows the selected stream's newest message at the
 * playhead as a collapsible record tree; streams without a generic
 * decode path or usable schema degrade to legible metadata instead of
 * silence. Stream selection lives in the per-tile raw state and the
 * settings sidebar; records come from the shared raw-message cache
 * (playhead-anchored, idle lane).
 */
const EpisodeRawMessageTile: React.FC<EpisodeTileProps> = () => {
  const tileId = useTileId();
  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <EpisodeRawMessageTileSettings /> }),
    [],
  );
  useRegisterEpisodeTileSettings(tileId, settingsRegistration);
  const stream = useEpisodeRawTileStream();
  const setTileTitle = useSetTileTitle();
  const { recordsByStream, subscribeRecord } = useEpisodeRawMessageContext();
  const { ensureEnumeration, enumeration } = useEpisodeNumericSeriesContext();
  const addFieldToPlot = useAddEpisodeFieldToPlot();

  // This effect declares interest in the selected stream while the tile
  // shows it; the bridge follows the playhead for interested streams.
  useEffect(() => {
    if (!stream) {
      return undefined;
    }
    return subscribeRecord(stream);
  }, [subscribeRecord, stream]);

  // The raw tree only shows "plot" on fields confirmed by the numeric
  // catalog. While the catalog is idle/loading/error, no affordance is shown.
  useEffect(() => {
    if (stream) {
      ensureEnumeration();
    }
  }, [ensureEnumeration, stream]);

  // This effect keeps the tile title synchronized with the selected stream.
  useEffect(() => {
    setTileTitle(stream ?? "Message", { source: "auto" });
  }, [setTileTitle, stream]);

  const state = stream ? recordsByStream.get(stream) : undefined;
  const result = state?.result;
  const plottableFieldPaths = useMemo(() => {
    if (!stream || enumeration.status !== "ready") {
      return undefined;
    }
    const streamFields = enumeration.streams.find(
      (entry) => entry.streamId === stream && entry.availability === "ready",
    );
    if (!streamFields || streamFields.fields.length === 0) {
      return undefined;
    }
    return new Set(streamFields.fields.map((field) => field.path));
  }, [enumeration, stream]);

  const handleAddFieldToPlot = useCallback(
    (fieldPath: string) => {
      if (stream) {
        addFieldToPlot(stream, fieldPath);
      }
    },
    [addFieldToPlot, stream],
  );

  return (
    <div className={rawStyles.body} data-cy="episode-raw-tile">
      {!stream ? (
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
              ? `Could not read ${stream}: ${state.error ?? "unknown error"}`
              : "Loading message…"}
          </span>
        </div>
      ) : (
        <>
          <MetaRow result={result} stream={stream} />
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
  stream,
}: {
  readonly result: RawRecordResult;
  readonly stream: string;
}) {
  const dataStream = useEpisodeDataStream();
  const { readFullMessageJson } = useEpisodeRawMessageContext();
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
      const json = await readFullMessageJson(stream, result.validFromNs);
      await navigator.clipboard.writeText(json);
      showCopyFeedback("copied");
    } catch {
      showCopyFeedback("failed");
    } finally {
      setCopying(false);
    }
  }, [copying, readFullMessageJson, result, showCopyFeedback, stream]);

  const startTimeNs = dataStream?.getTimelineIndex()?.startTimeNs;
  const relativeTime =
    result.timestampNs !== undefined && startTimeNs !== undefined
      ? formatRelativeSeconds(result.timestampNs, startTimeNs)
      : null;

  return (
    <div className={rawStyles.meta} data-cy="episode-raw-meta">
      <span className={rawStyles.metaStream}>{stream}</span>
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
        <EpisodeRawMessageTree
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

export default EpisodeRawMessageTile;
