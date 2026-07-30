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
  readonly timeOriginNs?: bigint;
  readonly truncated: boolean;
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
  sources,
  status,
  timeOriginNs,
  truncated,
  windowLabel,
  windowStartNs,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setViewport({
      height: event.currentTarget.clientHeight,
      scrollTop: event.currentTarget.scrollTop,
    });
  }, []);

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
            {...noSpaceToggleProps}
          />
        </div>
        <div className={styles.controlGroup}>
          {levels.map((level) => (
            <Checkbox
              key={level}
              checked={selectedLevels.includes(level)}
              label={level}
              onChange={(checked) => onLevelChange(level, checked)}
              {...noSpaceToggleProps}
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
                {...noSpaceToggleProps}
              />
            ))}
          </div>
        ) : null}
        <span className={styles.meta}>
          {status === "loading"
            ? "loading"
            : truncated
              ? `latest ${rows.length.toLocaleString()}`
              : rows.length.toLocaleString()}{" "}
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
        <div className={styles.scroll} onScroll={handleScroll} ref={scrollRef}>
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
                      ? formatRelativeTime(row.timeNs, timeOriginNs)
                      : formatWindowOffset(row.timeNs, windowStartNs)}
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

const noSpaceToggleProps = {
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
    if (isSpaceKey(event)) event.preventDefault();
  },
  onKeyUp: (event: React.KeyboardEvent<HTMLElement>) => {
    if (isSpaceKey(event)) {
      event.preventDefault();
    } else if (event.key === "Enter" || event.code === "Enter") {
      event.preventDefault();
      event.currentTarget.click();
    }
  },
};

function isSpaceKey(event: React.KeyboardEvent<HTMLElement>): boolean {
  return (
    event.key === " " || event.key === "Spacebar" || event.code === "Space"
  );
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
