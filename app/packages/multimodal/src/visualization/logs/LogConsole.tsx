import { Checkbox, FormField, Select } from "@voxel51/voodo";
import clsx from "clsx";
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { LogLevel } from "../../ir";
import { relativeTimeParts } from "../../utils/relative-time";
import { booleanNoSpaceToggleProps } from "../../utils/keyboard";
import type { EpisodeDiagnosticState } from "./diagnostic-console-state";
import type { EpisodeLogConsoleRow } from "./log-console-rows";
import { virtualLogRowRange } from "./log-console-virtualization";
import styles from "./LogConsole.module.css";

const LOG_ROW_HEIGHT_PX = 30;
const DIAGNOSTIC_ROW_HEIGHT_PX = 46;
const LOG_ROW_OVERSCAN = 8;

export type LogConsoleViewMode = "diagnostics" | "logs";

/** One selectable source presented by the neutral log console. */
export interface LogConsoleSource {
  readonly id: string;
  readonly label: string;
}

/** Prepared log rows, filters, and host interactions consumed by the console. */
export interface LogConsoleProps {
  readonly availableViewModes: readonly LogConsoleViewMode[];
  readonly diagnosticSeedIncomplete: boolean;
  readonly diagnostics: readonly EpisodeDiagnosticState[];
  readonly error?: string;
  readonly followPlayhead: boolean;
  readonly levels: readonly LogLevel[];
  readonly onFollowPlayheadChange: (follow: boolean) => void;
  readonly onLevelsChange: (levels: readonly LogLevel[]) => void;
  readonly onRowClick: (row: EpisodeLogConsoleRow) => void;
  readonly onStreamsChange: (streams: readonly string[]) => void;
  readonly onViewModeChange: (viewMode: LogConsoleViewMode) => void;
  readonly rows: readonly EpisodeLogConsoleRow[];
  readonly selectedLevels: readonly LogLevel[];
  readonly selectedStreams: readonly string[];
  readonly sources: readonly LogConsoleSource[];
  readonly status: "idle" | "loading" | "ready" | "error";
  /** Current playback anchor; changes keep an active Follow view at the tail. */
  readonly tailTimeNs?: bigint;
  readonly timeOriginNs?: bigint;
  /** Selected-level matches were dropped by bounded browser retention. */
  readonly retentionTruncated: boolean;
  /** Progressive source history did not prove full coverage of this window. */
  readonly searchIncomplete: boolean;
  readonly windowLabel: string;
  readonly windowStartNs: bigint;
  readonly viewMode: LogConsoleViewMode;
}

/** Displays prepared log rows and controls without reading episode data. */
export const LogConsole: React.FC<LogConsoleProps> = ({
  availableViewModes,
  diagnosticSeedIncomplete,
  diagnostics,
  error,
  followPlayhead,
  levels,
  onFollowPlayheadChange,
  onLevelsChange,
  onRowClick,
  onStreamsChange,
  onViewModeChange,
  rows,
  selectedLevels,
  selectedStreams,
  searchIncomplete,
  sources,
  status,
  tailTimeNs,
  timeOriginNs,
  retentionTruncated,
  windowLabel,
  windowStartNs,
  viewMode,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followSuspendedRef = useRef(false);
  const previousFollowRef = useRef(followPlayhead);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const rowCount = viewMode === "logs" ? rows.length : diagnostics.length;
  const rowHeightPx =
    viewMode === "logs" ? LOG_ROW_HEIGHT_PX : DIAGNOSTIC_ROW_HEIGHT_PX;
  const showRowList = status !== "error" && rowCount > 0;
  const visibleRange = useMemo(
    () =>
      virtualLogRowRange({
        overscan: LOG_ROW_OVERSCAN,
        rowCount,
        rowHeightPx,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      }),
    [rowCount, rowHeightPx, viewport.height, viewport.scrollTop],
  );
  const visibleRows = rows.slice(
    visibleRange.startIndex,
    visibleRange.endIndex,
  );
  const visibleDiagnostics = diagnostics.slice(
    visibleRange.startIndex,
    visibleRange.endIndex,
  );
  const levelOptions = useMemo(
    () => levels.map((level) => ({ data: { label: level }, id: level })),
    [levels],
  );
  const sourceOptions = useMemo(
    () =>
      sources.map((source) => ({
        data: { label: source.label },
        id: source.id,
      })),
    [sources],
  );
  const selectedLevelValues = useMemo(
    () => [...selectedLevels],
    [selectedLevels],
  );
  const selectedStreamValues = useMemo(
    () => [...selectedStreams],
    [selectedStreams],
  );
  const handleLevelSelection = useCallback(
    (value: string | string[] | null) => {
      const values = Array.isArray(value) ? value : value ? [value] : [];
      const validLevels = new Set(levels);
      onLevelsChange(
        values.filter((level): level is LogLevel =>
          validLevels.has(level as LogLevel),
        ),
      );
    },
    [levels, onLevelsChange],
  );
  const handleStreamSelection = useCallback(
    (value: string | string[] | null) => {
      onStreamsChange(Array.isArray(value) ? value : value ? [value] : []);
    },
    [onStreamsChange],
  );

  // This effect tracks the scroll viewport used to calculate visible rows.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const publish = () => {
      setViewport({
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      });
    };
    publish();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [showRowList]);

  // Active Follow owns the live tail. A user scroll away suspends it locally
  // before the persisted Follow setting updates, so incoming rows cannot fight
  // the gesture. Re-enabling Follow immediately clears the suspension.
  useLayoutEffect(() => {
    const resumed = followPlayhead && !previousFollowRef.current;
    previousFollowRef.current = followPlayhead;
    if (resumed) followSuspendedRef.current = false;
    if (
      viewMode !== "logs" ||
      !followPlayhead ||
      followSuspendedRef.current ||
      !showRowList
    ) {
      return;
    }

    const element = scrollRef.current;
    if (!element) return;
    const scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = scrollTop;
    setViewport((current) =>
      current.height === element.clientHeight && current.scrollTop === scrollTop
        ? current
        : { height: element.clientHeight, scrollTop },
    );
  }, [followPlayhead, rows, showRowList, tailTimeNs, viewMode]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      setViewport({
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      });
      const distanceFromTail =
        element.scrollHeight - element.clientHeight - element.scrollTop;
      if (viewMode === "logs" && followPlayhead && distanceFromTail > 1) {
        followSuspendedRef.current = true;
        onFollowPlayheadChange(false);
      }
    },
    [followPlayhead, onFollowPlayheadChange, viewMode],
  );

  return (
    <div className={styles.body} data-testid="episode-log-console-tile">
      <div className={styles.toolbar}>
        <div className={styles.toolbarPrimary}>
          {availableViewModes.length > 0 ? (
            <div
              aria-label="Log console view"
              className={styles.tabs}
              role="group"
            >
              {availableViewModes.map((mode) => (
                <button
                  aria-pressed={viewMode === mode}
                  className={clsx(
                    styles.tab,
                    viewMode === mode && styles.tabActive,
                  )}
                  key={mode}
                  onClick={() => onViewModeChange(mode)}
                  type="button"
                >
                  {mode === "logs" ? "Logs" : "Diagnostics"}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.controlGroup}>
            <Checkbox
              checked={followPlayhead}
              label="Follow"
              onChange={onFollowPlayheadChange}
              {...booleanNoSpaceToggleProps}
            />
          </div>
          <span className={styles.meta}>
            {viewMode === "logs"
              ? logConsoleResultSummary({
                  retentionTruncated,
                  rowCount: rows.length,
                  searchIncomplete,
                  status,
                })
              : diagnosticConsoleResultSummary({
                  rowCount: diagnostics.length,
                  searchIncomplete,
                  seedIncomplete: diagnosticSeedIncomplete,
                  status,
                })}{" "}
            · {windowLabel}
          </span>
        </div>
        <div className={styles.filters}>
          {viewMode === "logs" ? (
            <FormField
              className={styles.filterField}
              control={
                <Select
                  className={styles.filterSelect}
                  data-testid="log-level-select"
                  onChange={handleLevelSelection}
                  options={levelOptions}
                  portal
                  value={selectedLevelValues}
                />
              }
              label="Levels"
            />
          ) : null}
          {sources.length > 0 ? (
            <FormField
              className={styles.filterField}
              control={
                <Select
                  className={styles.filterSelect}
                  data-testid="log-source-select"
                  onChange={handleStreamSelection}
                  options={sourceOptions}
                  portal
                  value={selectedStreamValues}
                />
              }
              label={viewMode === "logs" ? "Log sources" : "Diagnostic sources"}
            />
          ) : null}
        </div>
      </div>
      {status === "error" ? (
        <div className={styles.errorState}>
          Could not read {viewMode === "logs" ? "logs" : "diagnostics"}
          {error ? `: ${error}` : ""}
        </div>
      ) : rowCount === 0 ? (
        <div className={styles.empty}>
          {availableViewModes.length === 0
            ? "No log or diagnostic streams in this recording"
            : sources.length === 0
              ? viewMode === "logs"
                ? "No log streams in this recording"
                : "No diagnostic streams in this recording"
              : selectedStreams.length === 0 ||
                  (viewMode === "logs" && selectedLevels.length === 0)
                ? "No filters selected"
                : viewMode === "logs"
                  ? "No log rows in this time window"
                  : "No diagnostic states at this playhead"}
        </div>
      ) : (
        <div
          className={styles.scroll}
          data-testid="log-console-scroll"
          onScroll={handleScroll}
          ref={scrollRef}
        >
          <div
            className={styles.virtualSpacer}
            style={{ height: rowCount * rowHeightPx }}
          >
            <div
              className={styles.virtualRows}
              style={{ transform: `translateY(${visibleRange.offsetPx}px)` }}
            >
              {viewMode === "logs"
                ? visibleRows.map((row) => (
                    <button
                      key={row.id}
                      className={styles.row}
                      onClick={() => onRowClick(row)}
                      title={rowTitle(row)}
                      type="button"
                    >
                      <span className={styles.time}>
                        {timeOriginNs !== undefined
                          ? formatRelativeTime(
                              row.messageTimeNs ?? row.timelineTimeNs,
                              timeOriginNs,
                            )
                          : formatWindowOffset(
                              row.messageTimeNs ?? row.timelineTimeNs,
                              windowStartNs,
                            )}
                      </span>
                      <span className={clsx(styles.level, styles[row.level])}>
                        {row.status ?? row.level}
                      </span>
                      <span className={styles.source}>
                        {row.groupLabel ?? row.stream}
                      </span>
                      <span className={styles.message}>{row.message}</span>
                    </button>
                  ))
                : visibleDiagnostics.map((diagnostic) => (
                    <button
                      key={diagnostic.id}
                      className={styles.diagnosticRow}
                      onClick={() => onRowClick(diagnostic.row)}
                      title={rowTitle(diagnostic.row)}
                      type="button"
                    >
                      <span
                        className={clsx(
                          styles.level,
                          styles.statusPill,
                          styles[diagnostic.row.level],
                        )}
                      >
                        {diagnostic.row.status ?? diagnostic.row.level}
                      </span>
                      <span className={styles.diagnosticIdentity}>
                        {diagnostic.row.groupLabel ?? diagnostic.row.stream}
                        <small>{diagnostic.row.stream}</small>
                      </span>
                      <span className={styles.message}>
                        {diagnostic.row.message}
                      </span>
                      <span
                        className={clsx(
                          styles.freshness,
                          styles[`freshness_${diagnostic.freshness}`],
                        )}
                      >
                        {diagnostic.freshness} · {formatAge(diagnostic.ageNs)}
                      </span>
                    </button>
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Concise, truthful description of searched and retained matching rows. */
export function logConsoleResultSummary({
  retentionTruncated,
  rowCount,
  searchIncomplete,
  status,
}: {
  readonly retentionTruncated: boolean;
  readonly rowCount: number;
  readonly searchIncomplete: boolean;
  readonly status: LogConsoleProps["status"];
}): string {
  if (status === "loading") return "loading";
  const count = rowCount.toLocaleString();
  if (searchIncomplete && retentionTruncated) {
    return `${count} retained · partial search and retention may omit matches`;
  }
  if (searchIncomplete) {
    return `${count} retained · window partially searched; matches may be missing`;
  }
  if (retentionTruncated) {
    return `latest ${count} retained · older matching rows omitted`;
  }
  return count;
}

/** Truthful summary for latest-state folding over bounded source evidence. */
export function diagnosticConsoleResultSummary({
  rowCount,
  searchIncomplete,
  seedIncomplete,
  status,
}: {
  readonly rowCount: number;
  readonly searchIncomplete: boolean;
  readonly seedIncomplete: boolean;
  readonly status: LogConsoleProps["status"];
}): string {
  if (status === "loading") return "loading";
  const count = `${rowCount.toLocaleString()} state${rowCount === 1 ? "" : "s"}`;
  if (searchIncomplete && seedIncomplete) {
    return `${count} · partial search; latest states and earlier identities may be missing`;
  }
  if (searchIncomplete) {
    return `${count} · partial search; latest states may be missing`;
  }
  if (seedIncomplete) {
    return `${count} · earlier identities may be missing`;
  }
  return count;
}

function formatRelativeTime(timeNs: bigint, originNs: bigint): string {
  const { milliseconds, negative, seconds } = relativeTimeParts(
    timeNs - originNs,
  );
  return `${negative ? "-" : ""}${seconds}.${milliseconds}s`;
}

function formatWindowOffset(timeNs: bigint, windowStartNs: bigint): string {
  return `+${formatRelativeTime(timeNs, windowStartNs)}`;
}

function formatAge(ageNs: bigint): string {
  const milliseconds = ageNs / 1_000_000n;
  if (milliseconds < 1_000n) return `${milliseconds}ms`;
  const seconds = Number(milliseconds) / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function rowTitle(row: EpisodeLogConsoleRow): string {
  const location =
    row.file && row.line !== undefined
      ? `${row.file}:${row.line}`
      : (row.file ?? null);
  const details =
    row.details.length > 0
      ? row.details.map((entry) => `${entry.key}=${entry.value}`).join(", ")
      : null;
  return [row.stream, row.groupLabel, location, row.functionName, details]
    .filter(Boolean)
    .join(" · ");
}

export default LogConsole;
