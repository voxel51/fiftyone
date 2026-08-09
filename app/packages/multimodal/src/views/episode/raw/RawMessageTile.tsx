import { humanReadableBytes } from "@fiftyone/utilities";
import {
  useIsPlaying,
  useIsPlayPending,
  usePlayback,
} from "@fiftyone/playback/runtime";
import { useSetTileTitle, useTileId, useTiling } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RawRecordCursor, RawRecordResult } from "../../../ir";
import { useDataStream } from "../playback/data-stream-context";
import { useAddFieldToPlot } from "../plots/use-add-field-to-plot";
import { useNumericSeriesContext } from "../plots/numeric-series-context";
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
import { RawMessageBrowser } from "./RawMessageBrowser";
import { formatRawMessageTime } from "./raw-message-time";

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
  const { expandedTileId } = useTiling();
  const { pause } = usePlayback();
  const isPlaying = useIsPlaying();
  const isPlayPending = useIsPlayPending();
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
  const { ensureEnumeration, enumeration } = useNumericSeriesContext();
  const addFieldToPlot = useAddFieldToPlot();
  const sourceKey = useDataStream()?.sourceKey ?? null;
  const [browseAnchor, setBrowseAnchor] = useState<
    (RawRecordResult & { readonly cursor: RawRecordCursor }) | null
  >(null);
  const browseSourceKeyRef = useRef<string | null>(null);

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

  // The raw tree only shows "plot" on fields confirmed by the numeric
  // catalog. While the catalog is idle/loading/error, no affordance is shown.
  useEffect(() => {
    if (streamKey) {
      ensureEnumeration();
    }
  }, [ensureEnumeration, streamKey]);

  const streamAvailable =
    streams.status !== "ready" ||
    streams.streams.some(
      (stream) =>
        stream.streamId === streamKey || stream.sourceName === streamKey,
    );
  const state =
    streamKey && streamAvailable ? recordsByStream.get(streamKey) : undefined;
  const result = state?.result;
  const selectedStream =
    streams.status === "ready"
      ? streams.streams.find(
          (stream) =>
            stream.streamId === streamKey || stream.sourceName === streamKey,
        )
      : undefined;
  const isMaximized = tileId !== null && expandedTileId === tileId;
  const canBrowse = Boolean(
    isMaximized && selectedStream?.supportsExactBrowsing && result?.cursor,
  );

  // This effect exits ephemeral Browse state when its owning conditions end.
  useEffect(() => {
    if (
      browseAnchor &&
      (!isMaximized ||
        isPlaying ||
        isPlayPending ||
        browseSourceKeyRef.current !== sourceKey ||
        (browseAnchor.streamId !== streamKey &&
          browseAnchor.sourceName !== streamKey) ||
        !selectedStream?.supportsExactBrowsing)
    ) {
      setBrowseAnchor(null);
    }
  }, [
    browseAnchor,
    isMaximized,
    isPlayPending,
    isPlaying,
    selectedStream?.supportsExactBrowsing,
    sourceKey,
    streamKey,
  ]);
  const selectedSourceName = useMemo(() => {
    if (result?.sourceName) {
      return result.sourceName;
    }
    if (!streamKey || enumeration.status !== "ready") {
      return null;
    }
    return (
      enumeration.streams.find(
        (stream) =>
          stream.streamId === streamKey || stream.sourceName === streamKey,
      )?.sourceName ?? null
    );
  }, [enumeration, result?.sourceName, streamKey]);

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

  const enterBrowse = useCallback(() => {
    if (!canBrowse || !result?.cursor) return;
    pause();
    browseSourceKeyRef.current = sourceKey;
    setBrowseAnchor(
      result as RawRecordResult & { readonly cursor: RawRecordCursor },
    );
  }, [canBrowse, pause, result, sourceKey]);

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
      ) : browseAnchor ? (
        <RawMessageBrowser
          anchor={browseAnchor}
          markerOwnerId={`raw-message-browser:${tileId ?? "unknown"}`}
          onAddNumericFieldToPlot={handleAddFieldToPlot}
          onExit={() => setBrowseAnchor(null)}
          plottableFieldPaths={plottableFieldPaths}
          renderMeta={(record, options) => (
            <MetaRow
              copyAnchor={options.copyCursor}
              copyDisabled={options.copyDisabled}
              result={record}
              streamKey={streamKey}
            />
          )}
          streamKey={streamKey}
        />
      ) : (
        <>
          <MetaRow
            action={
              canBrowse ? (
                <button
                  className={rawStyles.copyMessageButton}
                  onClick={enterBrowse}
                  type="button"
                >
                  Browse messages
                </button>
              ) : null
            }
            result={result}
            streamKey={streamKey}
          />
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
  action,
  copyAnchor,
  copyDisabled = false,
  result,
  streamKey,
}: {
  readonly action?: React.ReactNode;
  readonly copyAnchor?: bigint | RawRecordCursor;
  readonly copyDisabled?: boolean;
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
    if (!result.root || copying || copyDisabled) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      showCopyFeedback("failed");
      return;
    }

    setCopying(true);
    try {
      const json = await readFullMessageJson(
        streamKey,
        copyAnchor ?? result.cursor ?? result.validFromNs,
      );
      await navigator.clipboard.writeText(json);
      showCopyFeedback("copied");
    } catch {
      showCopyFeedback("failed");
    } finally {
      setCopying(false);
    }
  }, [
    copyAnchor,
    copyDisabled,
    copying,
    readFullMessageJson,
    result,
    showCopyFeedback,
    streamKey,
  ]);

  const startTimeNs = dataStream?.getTimelineIndex()?.startTimeNs;
  const relativeTime =
    result.timestampNs !== undefined && startTimeNs !== undefined
      ? formatRawMessageTime(result.timestampNs, startTimeNs)
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
          disabled={copying || copyDisabled}
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
      {action}
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

export default RawMessageTile;
