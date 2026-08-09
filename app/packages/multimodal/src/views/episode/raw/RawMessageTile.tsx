import { humanReadableBytes } from "@fiftyone/utilities";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RawRecordResult } from "../../../ir";
import { useDataStream } from "../playback/data-stream-context";
import { useAddFieldToPlot } from "../plots/use-add-field-to-plot";
import { useRawMessageContext } from "./raw-message-context";
import {
  useRawTileStream,
  useSetRawTileStream,
} from "../tiles/raw-message-binding";
import type { EpisodeTileProps } from "../tiles/tile-types";
import StructuredMessageTree from "../../../visualization/message/StructuredMessageTree";
import rawStyles from "../../../visualization/message/StructuredMessage.module.css";
import RawMessageTileSettings from "./RawMessageTileSettings";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import styles from "../tiles/Tile.module.css";
import { useCopyFeedback } from "../../../visualization/panel-ui/use-copy-feedback";
import { relativeTimeParts } from "../../../utils/relative-time";
import { errorMessage } from "../../../utils/errors";

/**
 * Raw message tile: the escape hatch that makes every stream at least
 * inspectable. Shows the selected stream's newest message at the
 * playhead as a collapsible record tree; streams without a generic
 * decode path or usable schema degrade to legible metadata instead of
 * silence. Stream selection lives in the per-tile raw state and the
 * settings sidebar; records come from the shared raw-message cache
 * (playhead-anchored, with an isolated lane for explicit paused seeks).
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
  const setStreamKey = useSetRawTileStream();
  const setTileTitle = useSetTileTitle();
  const { ensureStreams, recordsByStream, streams, subscribeRecord } =
    useRawMessageContext();
  const addFieldToPlot = useAddFieldToPlot();

  // Dataset-scoped layouts intentionally preserve raw panels and their stream
  // bindings across samples. Validate that binding against each new source so
  // an absent stream cannot keep the previous source's title or value alive.
  useEffect(() => {
    ensureStreams();
  }, [ensureStreams]);
  useEffect(() => {
    if (!streamKey || streams.status !== "ready") {
      return;
    }
    const available = streams.streams.some(
      (stream) =>
        stream.streamId === streamKey || stream.sourceName === streamKey,
    );
    if (!available) {
      setStreamKey(null);
    }
  }, [setStreamKey, streamKey, streams]);

  // This effect declares interest in the selected stream while the tile
  // shows it; the bridge follows the playhead for interested streams.
  useEffect(() => {
    if (!streamKey) {
      return undefined;
    }
    return subscribeRecord(streamKey);
  }, [streamKey, subscribeRecord]);

  const streamAvailable =
    streams.status !== "ready" ||
    streams.streams.some(
      (stream) =>
        stream.streamId === streamKey || stream.sourceName === streamKey,
    );
  const state =
    streamKey && streamAvailable ? recordsByStream.get(streamKey) : undefined;
  const result = state?.result;
  const selectedSourceName = useMemo(() => {
    if (result?.sourceName) {
      return result.sourceName;
    }
    if (!streamKey || streams.status !== "ready") {
      return null;
    }
    return (
      streams.streams.find(
        (stream) =>
          stream.streamId === streamKey || stream.sourceName === streamKey,
      )?.sourceName ?? null
    );
  }, [result?.sourceName, streamKey, streams]);

  // Keep canonical ids in tile state, but present the source name returned by
  // the adapter or inventory. While both are loading, preserve the title
  // assigned by the stream action or picker instead of flashing an id.
  useEffect(() => {
    if (!streamKey) {
      setTileTitle("Message", { source: "auto" });
    } else if (selectedSourceName) {
      setTileTitle(selectedSourceName, { source: "auto" });
    }
  }, [selectedSourceName, setTileTitle, streamKey]);

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
              ? `Could not read ${selectedSourceName ?? "the selected source"}: ${
                  state.error ?? "unknown error"
                }`
              : "Loading message…"}
          </span>
        </div>
      ) : (
        <>
          <MetaRow result={result} streamKey={streamKey} />
          <div className={rawStyles.content}>
            {state?.status === "loading" ? (
              <div
                className={`${styles.statusBadge} ${rawStyles.staleNotice}`}
                data-testid="episode-raw-stale"
                role="status"
                title="Loading the message at the playhead; showing the previous result"
              >
                Loading… Previous shown.
              </div>
            ) : state?.status === "error" ? (
              <div
                className={`${styles.statusBadge} ${styles.statusBadgeError} ${rawStyles.staleNotice}`}
                data-testid="episode-raw-stale"
                role="status"
                title={
                  state.error
                    ? `Refresh failed: ${state.error}`
                    : "Refresh failed"
                }
              >
                Refresh failed. Previous shown.
              </div>
            ) : null}
            <RecordBody
              onAddNumericFieldToPlot={handleAddFieldToPlot}
              result={result}
            />
          </div>
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
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyControllerRef = useRef<AbortController | null>(null);
  const [copyFeedback, showCopyFeedback] = useCopyFeedback<
    "idle" | "copied" | "failed"
  >("idle");

  useEffect(() => {
    setCopying(false);
    setCopyError(null);
    showCopyFeedback("idle");
    return () => {
      const controller = copyControllerRef.current;
      copyControllerRef.current = null;
      controller?.abort();
    };
  }, [
    result.sequence,
    result.timestampNs,
    result.validFromNs,
    showCopyFeedback,
    streamKey,
  ]);

  const handleCopyMessage = useCallback(async () => {
    if (copying) {
      const controller = copyControllerRef.current;
      copyControllerRef.current = null;
      controller?.abort();
      setCopying(false);
      setCopyError(null);
      showCopyFeedback("idle");
      return;
    }
    if (!result.root) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopyError("Clipboard access is unavailable");
      showCopyFeedback("failed");
      return;
    }

    const controller = new AbortController();
    copyControllerRef.current = controller;
    setCopyError(null);
    showCopyFeedback("idle");
    setCopying(true);
    const isCurrentCopy = () =>
      copyControllerRef.current === controller && !controller.signal.aborted;
    try {
      const json = await readFullMessageJson(
        streamKey,
        result.validFromNs,
        controller.signal,
      );
      if (!isCurrentCopy()) return;
      await navigator.clipboard.writeText(json);
      if (!isCurrentCopy()) return;
      showCopyFeedback("copied");
    } catch (error) {
      if (!isCurrentCopy()) return;
      setCopyError(errorMessage(error, "Copy failed"));
      showCopyFeedback("failed");
    } finally {
      if (isCurrentCopy()) {
        copyControllerRef.current = null;
        setCopying(false);
      }
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
        <>
          <button
            className={rawStyles.copyMessageButton}
            data-cy="episode-raw-copy-message"
            onClick={() => void handleCopyMessage()}
            title={
              copying
                ? "Cancel whole-message copy"
                : "Copy the whole message as compact JSON"
            }
            type="button"
          >
            {copying
              ? "Cancel copy"
              : copyFeedback === "copied"
                ? "Copied"
                : copyFeedback === "failed"
                  ? "Copy failed"
                  : "Copy message"}
          </button>
          {copyError ? (
            <span className={rawStyles.truncatedText} role="status">
              {copyError}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RecordBody({
  onAddNumericFieldToPlot,
  result,
}: {
  readonly onAddNumericFieldToPlot: (path: string) => void;
  readonly result: RawRecordResult;
}) {
  if (result.status === "ok" && result.root) {
    return (
      <div className={rawStyles.scroll}>
        <StructuredMessageTree
          onAddNumericFieldToPlot={onAddNumericFieldToPlot}
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
  const { milliseconds, negative, seconds } = relativeTimeParts(
    logTimeNs - startTimeNs,
  );
  return `t=${negative ? "-" : "+"}${seconds}.${milliseconds}s`;
}

export default RawMessageTile;
