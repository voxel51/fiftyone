import { Checkbox } from "@voxel51/voodo";
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
import type { EpisodeLogConsoleRow } from "./log-console-rows";
import { virtualLogRowRange } from "./log-console-virtualization";
import styles from "./LogConsole.module.css";

const LOG_ROW_HEIGHT_PX = 30;
const LOG_ROW_OVERSCAN = 8;

/** One selectable source presented by the neutral log console. */
export interface LogConsoleSource {
  readonly id: string;
  readonly label: string;
}

/** Prepared log rows, filters, and host interactions consumed by the console. */
export interface LogConsoleProps {
  readonly error?: string;
  readonly followPlayhead: boolean;
  readonly levels: readonly LogLevel[];
  readonly onFollowPlayheadChange: (follow: boolean) => void;
  readonly onLevelChange: (level: LogLevel, checked: boolean) => void;
  readonly onRowClick: (row: EpisodeLogConsoleRow) => void;
  readonly onStreamChange: (stream: string, checked: boolean) => void;
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
}

/** Displays prepared log rows and controls without reading episode data. */
export const LogConsole: React.FC<LogConsoleProps> = ({
  error,
  followPlayhead,
  levels,
  onFollowPlayheadChange,
  onLevelChange,
  onRowClick,
  onStreamChange,
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
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followSuspendedRef = useRef(false);
  const previousFollowRef = useRef(followPlayhead);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const showRowList = status !== "error" && rows.length > 0;
  const visibleRange = useMemo(
    () =>
      virtualLogRowRange({
        overscan: LOG_ROW_OVERSCAN,
        rowCount: rows.length,
        rowHeightPx: LOG_ROW_HEIGHT_PX,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
      }),
    [rows.length, viewport.height, viewport.scrollTop],
  );
  const visibleRows = rows.slice(
    visibleRange.startIndex,
    visibleRange.endIndex,
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
    if (!followPlayhead || followSuspendedRef.current || !showRowList) return;

    const element = scrollRef.current;
    if (!element) return;
    const scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = scrollTop;
    setViewport((current) =>
      current.height === element.clientHeight && current.scrollTop === scrollTop
        ? current
        : { height: element.clientHeight, scrollTop },
    );
  }, [followPlayhead, rows, showRowList, tailTimeNs]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      setViewport({
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      });
      const distanceFromTail =
        element.scrollHeight - element.clientHeight - element.scrollTop;
      if (followPlayhead && distanceFromTail > 1) {
        followSuspendedRef.current = true;
        onFollowPlayheadChange(false);
      }
    },
    [followPlayhead, onFollowPlayheadChange],
  );

  if (sources.length === 0) {
    return (
      <div className={styles.body} data-testid="episode-log-console-tile">
        <div className={styles.empty}>No log streams in this recording</div>
      </div>
    );
  }

  return (
    <div className={styles.body} data-testid="episode-log-console-tile">
      <div className={styles.toolbar}>
        <div className={styles.controlGroup}>
          <Checkbox
            checked={followPlayhead}
            label="Follow"
            onChange={onFollowPlayheadChange}
            {...booleanNoSpaceToggleProps}
          />
        </div>
        <div className={styles.controlGroup}>
          {levels.map((level) => (
            <Checkbox
              key={level}
              checked={selectedLevels.includes(level)}
              label={level}
              onChange={(checked) => onLevelChange(level, checked)}
              {...booleanNoSpaceToggleProps}
            />
          ))}
        </div>
        {sources.length > 1 ? (
          <div className={styles.controlGroup}>
            {sources.map((source) => (
              <Checkbox
                key={source.id}
                checked={selectedStreams.includes(source.id)}
                label={source.label}
                onChange={(checked) => onStreamChange(source.id, checked)}
                {...booleanNoSpaceToggleProps}
              />
            ))}
          </div>
        ) : null}
        <span className={styles.meta}>
          {logConsoleResultSummary({
            retentionTruncated,
            rowCount: rows.length,
            searchIncomplete,
            status,
          })}{" "}
          · {windowLabel}
        </span>
      </div>
      {status === "error" ? (
        <div className={styles.errorState}>
          Could not read logs{error ? `: ${error}` : ""}
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          {selectedStreams.length === 0 || selectedLevels.length === 0
            ? "No filters selected"
            : "No log rows in this time window"}
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
            style={{ height: rows.length * LOG_ROW_HEIGHT_PX }}
          >
            <div
              className={styles.virtualRows}
              style={{ transform: `translateY(${visibleRange.offsetPx}px)` }}
            >
              {visibleRows.map((row) => (
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

function formatRelativeTime(timeNs: bigint, originNs: bigint): string {
  const { milliseconds, negative, seconds } = relativeTimeParts(
    timeNs - originNs,
  );
  return `${negative ? "-" : ""}${seconds}.${milliseconds}s`;
}

function formatWindowOffset(timeNs: bigint, windowStartNs: bigint): string {
  return `+${formatRelativeTime(timeNs, windowStartNs)}`;
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
