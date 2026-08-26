import {
  getIsPlaying,
  getIsPlayPending,
  getPlayhead,
  PlaybackStoreContext,
  useIsPlaying,
  useIsPlayPending,
  usePlayback,
} from "@fiftyone/playback/runtime";
import { useSetTileTitle, useTileId } from "@fiftyone/tiling";
import { Icon, IconName, Size } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  StateActionFeatureSchema,
  StateActionFeatureStats,
  StateActionRow,
  StateActionStats,
} from "../../../ports";
import { errorMessage } from "../../../utils/errors";
import { virtualLogRowRange } from "../../../visualization/logs/log-console-virtualization";
import { useDataStream } from "../playback/data-stream-context";
import { useAddFieldToPlot } from "../plots/use-add-field-to-plot";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import type { EpisodeTileProps } from "../tiles/tile-types";
import tileStyles from "../tiles/Tile.module.css";
import { useStateActionContext } from "./state-action-context";
import {
  formatStateActionDelta,
  normalizeStateActionValue,
  stateActionValueHeader,
  stateActionValueModeAtom,
  type StateActionValueMode,
} from "./state-action-display";
import {
  compactStateActionFloat,
  formatEpisodeTime,
  formatStateActionValue,
  type FormattedStateActionValue,
} from "./state-action-format";
import StateActionTileSettings from "./StateActionTileSettings";
import styles from "./StateActionTile.module.css";

const ROW_HEIGHT_PX = 22;
const VIRTUALIZE_AFTER_ROWS = 150;
const VIRTUALIZE_OVERSCAN = 12;
const STATE_PANE_LABEL = "Observation state";
const ACTION_PANE_LABEL = "Action";

/**
 * State & Action tile: exact single-row inspection for VLA practitioners.
 * At any playhead position it shows `observation.state` and `action` from
 * one canonical source row — the playhead selects a row but is never the
 * transport for the displayed values — and previous/next controls step an
 * exact row cursor while seeking cameras to the row's timestamp.
 */
const StateActionTile: React.FC<EpisodeTileProps> = () => {
  const tileId = useTileId();
  const setTileTitle = useSetTileTitle();
  const { pause, seek } = usePlayback();
  const isPlaying = useIsPlaying();
  const isPlayPending = useIsPlayPending();
  const {
    ensureSchema,
    holdCursorRow,
    readDimensionStats,
    readRowAtCursor,
    readRowIndexWindow,
    retryRead,
    rowState,
    schema,
    subscribeRow,
  } = useStateActionContext();
  const dataStream = useDataStream();
  const addFieldToPlot = useAddFieldToPlot();
  // Nullable on purpose: standalone tests render the tile without a
  // playback provider; inside the shell the store is always present.
  const playbackStore = useContext(PlaybackStoreContext);
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepPending, setStepPending] = useState(false);
  const stepPendingRef = useRef(false);
  const [cursorCopied, setCursorCopied] = useState(false);

  // Settings render through the sidebar's tile-settings registry, not here.
  const settingsRegistration = useMemo(
    () => ({ content: <StateActionTileSettings /> }),
    [],
  );
  useRegisterTileSettings(tileId, settingsRegistration);

  useEffect(() => {
    setTileTitle("State & Action", { source: "auto" });
  }, [setTileTitle]);

  // This passive effect (re)publishes the schema after any shell remount
  // whose stale cleanup wiped the bridge's layout-phase publication.
  useEffect(() => {
    ensureSchema();
  }, [ensureSchema]);

  // This effect declares interest in the canonical row while the tile is
  // mounted; the bridge follows the playhead for interested tiles.
  useEffect(() => subscribeRow(), [subscribeRow]);

  const schemaFacts = schema.status === "ready" ? schema.schema : null;
  const [dimensionStats, setDimensionStats] = useState<StateActionStats | null>(
    null,
  );
  // This effect loads the declared dataset ranges once per session so value
  // rows can carry faint in-context markers; absent stats render none.
  useEffect(() => {
    if (!schemaFacts) return undefined;
    const controller = new AbortController();
    readDimensionStats(controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setDimensionStats(result);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [readDimensionStats, schemaFacts]);
  const row = rowState?.row ?? null;
  const valueMode = useAtomValue(stateActionValueModeAtom);

  const [previousRow, setPreviousRow] = useState<{
    readonly forCursor: string;
    readonly row: StateActionRow | null;
  } | null>(null);
  const rowCursor = row?.cursor;
  const rowFrameIndex = row?.frameIndex;
  // This effect resolves the row before the committed one so each value can
  // show its change from the previous frame; both reads hit the cached slab.
  useEffect(() => {
    if (rowCursor === undefined || rowFrameIndex === undefined) {
      setPreviousRow(null);
      return undefined;
    }
    if (rowFrameIndex <= 0) {
      setPreviousRow({ forCursor: rowCursor, row: null });
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      const window = await readRowIndexWindow(
        { after: 0, anchorCursor: rowCursor, before: 1 },
        controller.signal,
      );
      const anchorIndex = window.entries.findIndex(
        (entry) => entry.cursor === window.selectedCursor,
      );
      const previous =
        anchorIndex > 0 ? window.entries[anchorIndex - 1] : undefined;
      return previous
        ? readRowAtCursor(previous.cursor, controller.signal)
        : null;
    })().then(
      (resolved) => {
        if (!controller.signal.aborted) {
          setPreviousRow({ forCursor: rowCursor, row: resolved });
        }
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [readRowAtCursor, readRowIndexWindow, rowCursor, rowFrameIndex]);
  const previousForRow =
    previousRow &&
    rowCursor !== undefined &&
    previousRow.forCursor === rowCursor
      ? previousRow.row
      : null;

  const rowCount = schemaFacts?.rowCount ?? 0;
  const canStepPrevious = Boolean(row && row.frameIndex > 0 && !stepPending);
  const canStepNext = Boolean(
    row && row.frameIndex < rowCount - 1 && !stepPending,
  );

  const step = useCallback(
    async (direction: -1 | 1) => {
      const anchor = row;
      const timeline = dataStream?.getTimelineIndex();
      if (!anchor || !timeline || stepPendingRef.current) return;
      stepPendingRef.current = true;
      setStepPending(true);
      setStepError(null);
      const playheadAtClick = playbackStore ? getPlayhead(playbackStore) : null;
      const superseded = () =>
        playbackStore !== null &&
        (getPlayhead(playbackStore) !== playheadAtClick ||
          getIsPlaying(playbackStore) ||
          getIsPlayPending(playbackStore));
      try {
        const window = await readRowIndexWindow({
          after: direction === 1 ? 1 : 0,
          anchorCursor: anchor.cursor,
          before: direction === -1 ? 1 : 0,
        });
        const anchorIndex = window.entries.findIndex(
          (entry) => entry.cursor === window.selectedCursor,
        );
        const target =
          anchorIndex >= 0
            ? window.entries[anchorIndex + direction]
            : undefined;
        if (!target) return;
        const nextRow = await readRowAtCursor(target.cursor);
        if (nextRow.cursor !== target.cursor) {
          throw new Error("Exact row read returned a different cursor");
        }
        // A newer user gesture wins: a seek or play issued while the exact
        // reads were in flight must not be yanked back to this step target.
        if (superseded()) return;
        // Render the cursor row, then land cameras on the same frame with an
        // ordinary paused seek. The synchronous hold after seek() precedes the
        // seek's microtask fill, so the echo cannot re-resolve through time.
        const seekSec = timeline.nsToSec(nextRow.timestampNs);
        pause();
        seek(seekSec);
        holdCursorRow(nextRow, timeline.secToNs(seekSec));
      } catch (error) {
        setStepError(errorMessage(error));
      } finally {
        stepPendingRef.current = false;
        setStepPending(false);
      }
    },
    [
      dataStream,
      holdCursorRow,
      pause,
      playbackStore,
      readRowAtCursor,
      readRowIndexWindow,
      row,
      seek,
    ],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      void step(event.key === "ArrowLeft" ? -1 : 1);
    },
    [step],
  );

  const copyCursor = useCallback(() => {
    if (!row) return;
    void navigator.clipboard?.writeText?.(row.cursor).then(
      () => setCursorCopied(true),
      () => undefined,
    );
  }, [row]);
  // This effect clears transient copy feedback when the selected row moves.
  useEffect(() => {
    setCursorCopied(false);
  }, [row?.cursor]);

  const startTimeNs = dataStream?.getTimelineIndex()?.startTimeNs ?? 0n;
  const playheadDiffers =
    row !== null &&
    rowState?.targetNs !== undefined &&
    !rowState.pinned &&
    rowState.targetNs !== row.timestampNs;
  const paused = !isPlaying && !isPlayPending;
  const announcement =
    paused && row ? `Frame ${row.frameIndex} of ${rowCount}` : "";
  const status = rowState?.status;
  const hasCommittedRow = rowState?.row !== undefined;
  const showEmpty = status === "ready" && row === null;
  const showBlockingError = status === "error" && !hasCommittedRow;
  const missingFeatureNote = schemaFacts
    ? !schemaFacts.state
      ? "No observation.state feature declared"
      : !schemaFacts.action
        ? "No action feature declared"
        : null
    : null;

  return (
    <div
      aria-label="State and action table"
      className={styles.body}
      data-cy="episode-state-action-tile"
      onKeyDown={handleKeyDown}
      role="group"
      tabIndex={0}
    >
      <div className={styles.header}>
        <span
          className={styles.headerFrame}
          data-cy="episode-state-action-frame"
        >
          {row ? `Frame ${row.frameIndex} of ${rowCount}` : `— of ${rowCount}`}
        </span>
        {row ? (
          <span title={exactTimeTitle(row.timestampNs, startTimeNs)}>
            {formatEpisodeTime(row.timestampNs, startTimeNs)}
          </span>
        ) : null}
        {playheadDiffers && rowState?.targetNs !== undefined ? (
          <span title="Playhead time; the row holds until the next recorded row">
            {`playhead ${formatEpisodeTime(rowState.targetNs, startTimeNs)}`}
          </span>
        ) : null}
        {stepError ? (
          <span className={styles.headerError} role="status">
            {stepError}
          </span>
        ) : null}
        <div className={styles.headerActions}>
          <button
            aria-label={cursorCopied ? "Row cursor copied" : "Copy row cursor"}
            className={styles.actionButton}
            disabled={!row}
            onClick={copyCursor}
            onPointerDown={(event) => event.stopPropagation()}
            title={
              cursorCopied
                ? "Row cursor copied"
                : "Copy the opaque row cursor for reconciliation"
            }
            type="button"
          >
            <Icon
              name={cursorCopied ? IconName.Check : IconName.ContentCopy}
              size={Size.Xs}
            />
          </button>
          <button
            aria-label={
              row && row.frameIndex > 0
                ? `Previous row (frame ${row.frameIndex - 1})`
                : "Previous row"
            }
            className={styles.actionButton}
            data-cy="episode-state-action-previous"
            disabled={!canStepPrevious}
            onClick={() => void step(-1)}
            onPointerDown={(event) => event.stopPropagation()}
            title="Previous row"
            type="button"
          >
            <Icon name={IconName.ChevronLeft} size={Size.Xs} />
          </button>
          <button
            aria-label={
              row && row.frameIndex < rowCount - 1
                ? `Next row (frame ${row.frameIndex + 1})`
                : "Next row"
            }
            className={styles.actionButton}
            data-cy="episode-state-action-next"
            disabled={!canStepNext}
            onClick={() => void step(1)}
            onPointerDown={(event) => event.stopPropagation()}
            title="Next row"
            type="button"
          >
            <Icon name={IconName.ChevronRight} size={Size.Xs} />
          </button>
        </div>
      </div>
      {!schemaFacts ? (
        <div className={styles.notice}>Preparing state/action schema…</div>
      ) : showBlockingError ? (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <span>
            {`Could not read the state/action row: ${rowState?.error ?? "unknown error"}`}
          </span>
          <button
            className={styles.retryButton}
            onClick={retryRead}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          {hasCommittedRow && status === "loading" ? (
            <div
              className={`${tileStyles.statusBadge} ${styles.staleNotice}`}
              data-testid="episode-state-action-stale"
              role="status"
              title="Resolving the row at the playhead; showing the previous result"
            >
              Loading… Previous shown.
            </div>
          ) : hasCommittedRow && status === "error" ? (
            <div
              className={`${tileStyles.statusBadge} ${tileStyles.statusBadgeError} ${styles.staleNotice} ${styles.staleInteractive}`}
              data-testid="episode-state-action-stale"
              role="status"
              title={
                rowState?.error
                  ? `Refresh failed: ${rowState.error}`
                  : "Refresh failed"
              }
            >
              Refresh failed. Previous shown.
              <button
                className={styles.staleRetryButton}
                onClick={retryRead}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {missingFeatureNote ? (
            <div className={styles.missingNote} role="note">
              {missingFeatureNote}
            </div>
          ) : null}
          {showEmpty ? (
            <div className={styles.notice} data-cy="episode-state-action-empty">
              No state/action row at this time
            </div>
          ) : (
            <div className={styles.panes}>
              {schemaFacts.state ? (
                <FeaturePane
                  featureError={row?.featureErrors?.state}
                  label={STATE_PANE_LABEL}
                  mode={valueMode}
                  onPlotField={addFieldToPlot}
                  previousValues={previousForRow?.state}
                  schema={schemaFacts.state}
                  stats={dimensionStats?.state}
                  values={row?.state}
                />
              ) : null}
              {schemaFacts.action ? (
                <FeaturePane
                  featureError={row?.featureErrors?.action}
                  label={ACTION_PANE_LABEL}
                  mode={valueMode}
                  onPlotField={addFieldToPlot}
                  previousValues={previousForRow?.action}
                  schema={schemaFacts.action}
                  stats={dimensionStats?.action}
                  values={row?.action}
                />
              ) : null}
            </div>
          )}
        </div>
      )}
      <span aria-live="polite" className={styles.srOnly}>
        {announcement}
      </span>
    </div>
  );
};

function FeaturePane({
  featureError,
  label,
  mode,
  onPlotField,
  previousValues,
  schema,
  stats,
  values,
}: {
  readonly featureError?: string;
  readonly label: string;
  readonly mode: StateActionValueMode;
  readonly onPlotField?: (stream: string, fieldPath: string) => void;
  readonly previousValues?: readonly unknown[];
  readonly schema: StateActionFeatureSchema;
  readonly stats?: StateActionFeatureStats;
  readonly values?: readonly unknown[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const rows = useMemo(
    () => paneRows(schema, values, stats, mode, previousValues),
    [mode, previousValues, schema, stats, values],
  );
  const virtualize = rows.length > VIRTUALIZE_AFTER_ROWS;

  // This effect tracks the fixed-row viewport for large vectors so long
  // action/state vectors stay usable through row virtualization.
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || !virtualize) return undefined;
    const publish = () =>
      setViewport({ height: scroll.clientHeight, scrollTop: scroll.scrollTop });
    publish();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [virtualize]);

  const range = virtualize
    ? virtualLogRowRange({
        overscan: VIRTUALIZE_OVERSCAN,
        rowCount: rows.length,
        rowHeightPx: ROW_HEIGHT_PX,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      })
    : { endIndex: rows.length, offsetPx: 0, startIndex: 0 };
  const visible = rows.slice(range.startIndex, range.endIndex);

  return (
    <section aria-label={label} className={styles.pane}>
      <div className={styles.paneHeading}>
        <span>{label}</span>
        <span className={styles.paneSchema} title="Declared dtype and shape">
          {`${schema.dtype} [${schema.shape.join(",")}]`}
        </span>
      </div>
      {featureError ? (
        <div className={styles.paneError} role="alert">
          {featureError}
        </div>
      ) : null}
      <div
        className={styles.paneScroll}
        onScroll={
          virtualize
            ? (event) =>
                setViewport({
                  height: event.currentTarget.clientHeight,
                  scrollTop: event.currentTarget.scrollTop,
                })
            : undefined
        }
        ref={scrollRef}
      >
        <div
          aria-label={`${label} values`}
          aria-rowcount={rows.length}
          role="table"
        >
          <div className={styles.columnHeaders} role="row">
            <span role="columnheader">Dimension</span>
            <span role="columnheader">
              <span className={styles.srOnly}>Declared range</span>
            </span>
            <span role="columnheader" style={{ textAlign: "right" }}>
              {stateActionValueHeader(mode)}
            </span>
            <span
              role="columnheader"
              style={{ textAlign: "right" }}
              title="Change from the previous row"
            >
              Δ
            </span>
            <span role="columnheader">
              <span className={styles.srOnly}>Plot</span>
            </span>
          </div>
          <div
            className={styles.rowSpacer}
            role="rowgroup"
            style={
              virtualize ? { height: rows.length * ROW_HEIGHT_PX } : undefined
            }
          >
            <div
              style={
                virtualize
                  ? { transform: `translateY(${range.offsetPx}px)` }
                  : undefined
              }
            >
              {visible.map((paneRow) => (
                <div
                  aria-rowindex={paneRow.index + 1}
                  className={styles.dimRow}
                  key={paneRow.index}
                  role="row"
                >
                  <span
                    className={styles.dimName}
                    role="rowheader"
                    title={paneRow.name}
                  >
                    {paneRow.name}
                  </span>
                  <span className={styles.dimTrackCell} role="cell">
                    <ValueMarker marker={paneRow.marker} />
                  </span>
                  <span className={styles.dimValue} role="cell">
                    <ValueCell value={paneRow.value} />
                  </span>
                  <span
                    className={styles.dimDelta}
                    role="cell"
                    title={paneRow.delta?.exact}
                  >
                    {paneRow.delta?.text ?? ""}
                  </span>
                  <span className={styles.dimAction} role="cell">
                    {onPlotField &&
                    schema.numericStreamId &&
                    paneRow.plotFieldPath ? (
                      <button
                        aria-label={`Plot ${paneRow.name}`}
                        className={styles.plotButton}
                        onClick={() =>
                          onPlotField(
                            schema.numericStreamId as string,
                            paneRow.plotFieldPath as string,
                          )
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        title={`Plot ${paneRow.name} over the episode`}
                        type="button"
                      >
                        <Icon name={IconName.Insights} size={Size.Xs} />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface PaneRow {
  readonly delta?: { readonly exact: string; readonly text: string };
  readonly index: number;
  readonly marker?: ValueMarkerFacts;
  readonly name: string;
  readonly plotFieldPath?: string;
  readonly value: PaneValue;
}

/** Where one exact value sits inside its declared dataset range. */
interface ValueMarkerFacts {
  readonly band?: readonly [number, number];
  readonly outOfRange: boolean;
  readonly position: number;
  readonly title: string;
}

type PaneValue =
  | { readonly kind: "skeleton" }
  | { readonly kind: "missing" }
  | FormattedStateActionValue;

function paneRows(
  schema: StateActionFeatureSchema,
  values: readonly unknown[] | undefined,
  stats: StateActionFeatureStats | undefined,
  mode: StateActionValueMode,
  previousValues: readonly unknown[] | undefined,
): readonly PaneRow[] {
  // Never shift or hide values on a shape mismatch: render every declared
  // dimension and every extra source value under its stable numeric index.
  const count = Math.max(schema.dimensions.length, values?.length ?? 0);
  return Array.from({ length: count }, (_, index) => {
    const dimension = schema.dimensions[index];
    const name = dimension?.name ?? `[${index}]`;
    const raw =
      values !== undefined && index < values.length ? values[index] : undefined;
    // A dimension whose declared normalization parameters are unusable
    // falls back to the raw value instead of inventing a scale.
    const normalized =
      mode !== "raw" && typeof raw === "number" && Number.isFinite(raw)
        ? normalizeStateActionValue(mode, stats, index, raw)
        : null;
    const rawFormatted = formatStateActionValue(raw);
    const value: PaneValue =
      values === undefined
        ? { kind: "skeleton" }
        : index >= values.length
          ? { kind: "missing" }
          : normalized !== null
            ? { ...rawFormatted, text: compactStateActionFloat(normalized) }
            : rawFormatted;
    const marker = valueMarker(stats, index, raw);
    const delta = paneRowDelta(
      raw,
      previousValues?.[index],
      mode,
      stats,
      index,
    );
    return {
      ...(delta ? { delta } : {}),
      index,
      ...(marker ? { marker } : {}),
      name,
      ...(dimension?.numericFieldPath
        ? { plotFieldPath: dimension.numericFieldPath }
        : {}),
      value,
    };
  });
}

/**
 * Change from the previous row, on the same scale the value column shows:
 * normalized when this dimension normalizes, raw otherwise. Non-numeric
 * pairs render no delta rather than a fabricated zero.
 */
function paneRowDelta(
  raw: unknown,
  previousRaw: unknown,
  mode: StateActionValueMode,
  stats: StateActionFeatureStats | undefined,
  index: number,
): PaneRow["delta"] | undefined {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    typeof previousRaw !== "number" ||
    !Number.isFinite(previousRaw)
  ) {
    return undefined;
  }
  let current = raw;
  let previous = previousRaw;
  if (mode !== "raw") {
    const currentNormalized = normalizeStateActionValue(
      mode,
      stats,
      index,
      raw,
    );
    const previousNormalized = normalizeStateActionValue(
      mode,
      stats,
      index,
      previousRaw,
    );
    if (currentNormalized !== null && previousNormalized !== null) {
      current = currentNormalized;
      previous = previousNormalized;
    }
  }
  const delta = current - previous;
  return {
    exact: `Δ ${String(delta)} from the previous row`,
    text: formatStateActionDelta(delta),
  };
}

/**
 * Positions one exact value on its dimension's declared dataset range so
 * the row carries a faint in-context marker. Only source-declared facts
 * feed the geometry; a value outside the declared range clamps to the
 * edge and tints the tick instead of stretching the scale.
 */
function valueMarker(
  stats: StateActionFeatureStats | undefined,
  index: number,
  value: unknown,
): ValueMarkerFacts | undefined {
  if (!stats || typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const min = stats.min?.[index];
  const max = stats.max?.[index];
  if (
    min === undefined ||
    max === undefined ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return undefined;
  }
  const position = (candidate: number) =>
    Math.min(1, Math.max(0, (candidate - min) / (max - min)));
  const q01 = stats.q01?.[index];
  const q99 = stats.q99?.[index];
  return {
    ...(q01 !== undefined && q99 !== undefined
      ? { band: [position(q01), position(q99)] as const }
      : {}),
    outOfRange: value < min || value > max,
    position: position(value),
    title: `declared ${formatStateActionValue(min).text} … ${formatStateActionValue(max).text}`,
  };
}

/** Faint declared-range strip with a tick at the current value. */
function ValueMarker({ marker }: { readonly marker?: ValueMarkerFacts }) {
  if (!marker) return null;
  return (
    <span aria-hidden className={styles.dimTrack} title={marker.title}>
      {marker.band ? (
        <span
          className={styles.dimTrackBand}
          style={{
            left: `${marker.band[0] * 100}%`,
            width: `${Math.max(1, (marker.band[1] - marker.band[0]) * 100)}%`,
          }}
        />
      ) : null}
      <span
        className={`${styles.dimTrackTick} ${
          marker.outOfRange ? styles.dimTrackTickOut : ""
        }`}
        style={{ left: `${marker.position * 100}%` }}
      />
    </span>
  );
}

function ValueCell({ value }: { readonly value: PaneValue }) {
  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText?.(text).catch(() => undefined);
  }, []);
  if (value.kind === "skeleton") {
    return <span className={styles.skeletonValue}>…</span>;
  }
  if (value.kind === "missing") {
    return (
      <span
        className={styles.invalidValue}
        title="This dimension is missing from the source row"
      >
        missing
      </span>
    );
  }
  return (
    <button
      aria-label={`Copy exact value ${value.exact}`}
      className={`${styles.valueButton} ${value.invalid ? styles.invalidValue : ""}`}
      onClick={() => copy(value.exact)}
      onPointerDown={(event) => event.stopPropagation()}
      title={`${value.exact} — click to copy the exact value`}
      type="button"
    >
      {value.text}
    </button>
  );
}

function exactTimeTitle(timeNs: bigint, originNs: bigint): string {
  const deltaNs = timeNs - originNs;
  const negative = deltaNs < 0n;
  const magnitude = negative ? -deltaNs : deltaNs;
  const seconds = magnitude / 1_000_000_000n;
  const nanoseconds = (magnitude % 1_000_000_000n).toString().padStart(9, "0");
  return `Row time t=${negative ? "-" : "+"}${seconds}.${nanoseconds}s`;
}

export default StateActionTile;
