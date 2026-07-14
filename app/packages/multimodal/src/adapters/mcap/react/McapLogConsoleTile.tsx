import {
  getPlayhead,
  subscribePlayhead,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle } from "@fiftyone/tiling";
import { Checkbox } from "@voxel51/voodo";
import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { byteSourceAccessKey } from "../../../query/bytes";
import { useSceneSourcesByType } from "../../../scene-inventory/SceneInventoryProvider";
import { MCAP_LOG_LEVELS, type McapLogLevel } from "../log-records";
import {
  useMcapLogTileSettings,
  useSetMcapLogTileSettings,
} from "./mcap-log-tile-state";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  logConsoleRowsFromDecodedMessage,
  type McapLogConsoleRow,
} from "./mcap-log-console-rows";
import { useMcapLogConsoleContext } from "./mcap-log-console-context";
import {
  coveredLogReadRange,
  logWindowForCenter,
  mergeBoundedLogRows,
  mergeLogReadRanges,
  missingLogReadRanges,
  pruneLogRows,
  type LogReadRange,
  virtualLogRowRange,
} from "./mcap-log-console-window";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import styles from "./McapLogConsoleTile.module.css";
import tileStyles from "./McapTile.module.css";
import type { McapTileProps } from "./mcap-tile-types";

const PLAYHEAD_REFRESH_MS = 500;
const LOG_WINDOW_BEFORE_NS = 30_000_000_000n;
const LOG_WINDOW_AFTER_NS = 2_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const LOG_WINDOW_LABEL = `${
  (LOG_WINDOW_BEFORE_NS + LOG_WINDOW_AFTER_NS) / NANOSECONDS_PER_SECOND
}s`;
const LOG_READ_LIMIT = 600;
const LOG_ROW_LIMIT = 2_000;
const LOG_ROW_HEIGHT_PX = 30;
const LOG_ROW_OVERSCAN = 8;

interface LogRowsState {
  readonly error?: string;
  readonly rawRows: readonly McapLogConsoleRow[];
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly truncated: boolean;
}

interface LogRowsCacheWindow {
  readonly client: unknown;
  readonly ranges: readonly LogReadRange[];
  readonly sourceKey: string;
  readonly topicsKey: string;
}

const INITIAL_ROWS: LogRowsState = {
  rawRows: [],
  status: "idle",
  truncated: false,
};

const McapLogConsoleTile: React.FC<McapTileProps> = () => {
  const logSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.LOG);
  const { client, source } = useMcapLogConsoleContext();
  const dataStream = useMcapDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const setTileTitle = useSetTileTitle();
  const { enabledTopics, followPlayhead, selectedLevels } =
    useMcapLogTileSettings();
  const setLogSettings = useSetMcapLogTileSettings();
  const [centerTimeNs, setCenterTimeNs] = useState<bigint | undefined>();
  const [state, setState] = useState<LogRowsState>(INITIAL_ROWS);
  const lastPlayheadPublishMsRef = useRef(0);
  const fetchedWindowRef = useRef<LogRowsCacheWindow | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });

  // This effect keeps the automatic tile title aligned with the panel's role.
  useEffect(() => {
    setTileTitle("Logs", { source: "auto" });
  }, [setTileTitle]);

  const selectedTopics = useMemo(() => {
    const ids = logSources.map((entry) => entry.id);
    if (enabledTopics === undefined) return ids;
    const valid = enabledTopics.filter((topic) => ids.includes(topic));
    return valid.length > 0 ? valid : ids;
  }, [enabledTopics, logSources]);

  // This effect resets the throttle when follow mode or playback ownership
  // changes; fetch-state transitions intentionally preserve it.
  useEffect(() => {
    lastPlayheadPublishMsRef.current = 0;
  }, [followPlayhead, store, timelineIndex]);

  // This effect follows the playhead at a bounded refresh rate and pauses
  // while a history read is active so follow-up windows cannot pile up.
  useEffect(() => {
    if (!followPlayhead || !timelineIndex || state.status === "loading") {
      return undefined;
    }

    const publish = () => {
      const now = Date.now();
      if (now - lastPlayheadPublishMsRef.current < PLAYHEAD_REFRESH_MS) {
        return;
      }
      lastPlayheadPublishMsRef.current = now;
      setCenterTimeNs(timelineIndex.nearestTick(getPlayhead(store)));
    };

    publish();
    return subscribePlayhead(store, publish);
  }, [followPlayhead, state.status, store, timelineIndex]);

  // This effect seeds the first log window from the recording timeline.
  useEffect(() => {
    if (centerTimeNs === undefined && timelineIndex) {
      setCenterTimeNs(timelineIndex.startTimeNs);
    }
  }, [centerTimeNs, timelineIndex]);

  const selectedLevelSet = useMemo(
    () => new Set(selectedLevels),
    [selectedLevels],
  );
  const selectedTopicsKey = useMemo(
    () => [...selectedTopics].sort().join("\0"),
    [selectedTopics],
  );
  const sourceKey = source ? byteSourceAccessKey(source) : null;
  const activeWindow = useMemo(
    () =>
      centerTimeNs === undefined
        ? null
        : logWindowForCenter(
            centerTimeNs,
            LOG_WINDOW_BEFORE_NS,
            LOG_WINDOW_AFTER_NS,
          ),
    [centerTimeNs],
  );
  const windowStartNs = activeWindow?.startTimeNs ?? 0n;
  const windowEndNs = activeWindow?.endTimeNs;
  const rows = useMemo(
    () =>
      state.rawRows.filter(
        (row) =>
          selectedLevelSet.has(row.level) &&
          (windowEndNs === undefined ||
            (row.timeNs >= windowStartNs && row.timeNs <= windowEndNs)),
      ),
    [selectedLevelSet, state.rawRows, windowEndNs, windowStartNs],
  );

  // This effect reads only the uncovered part of the active log window,
  // cancels stale reads, and retains a bounded live tail for rendering.
  useEffect(() => {
    if (!source || !sourceKey || !activeWindow || selectedTopics.length === 0) {
      fetchedWindowRef.current = null;
      setState(INITIAL_ROWS);
      return undefined;
    }

    let cancelled = false;
    const cachedWindow = fetchedWindowRef.current;
    const reusableWindow =
      cachedWindow?.client === client &&
      cachedWindow.sourceKey === sourceKey &&
      cachedWindow.topicsKey === selectedTopicsKey
        ? clipLogCacheWindow(cachedWindow, activeWindow)
        : null;
    fetchedWindowRef.current = reusableWindow;

    if (selectedLevels.length === 0) {
      setState((current) => ({
        ...current,
        error: undefined,
        rawRows: pruneLogRows(current.rawRows, activeWindow),
        status: "ready",
      }));
      return undefined;
    }

    const ranges = missingLogReadRanges(
      reusableWindow?.ranges ?? null,
      activeWindow,
    );

    if (ranges.length === 0) {
      setState((current) => {
        const rawRows = pruneLogRows(current.rawRows, activeWindow);
        return current.status === "ready" && rawRows === current.rawRows
          ? current
          : { ...current, error: undefined, rawRows, status: "ready" };
      });
      return undefined;
    }

    if (!reusableWindow) {
      fetchedWindowRef.current = null;
      setState({ rawRows: [], status: "loading", truncated: false });
    } else {
      setState((current) => ({
        ...current,
        error: undefined,
        rawRows: pruneLogRows(current.rawRows, activeWindow),
        status: "loading",
      }));
    }

    void (async () => {
      try {
        const coveredRanges: LogReadRange[] = reusableWindow
          ? [...reusableWindow.ranges]
          : [];
        const fetchedRows: McapLogConsoleRow[] = [];
        for (const range of ranges) {
          let messageCount = 0;
          let lastMessageTimeNs: bigint | undefined;
          for await (const message of client.readDecodedMessages(
            {
              endTimeNs: range.endTimeNs,
              limit: LOG_READ_LIMIT,
              source,
              startTimeNs: range.startTimeNs,
              topics: selectedTopics,
            },
            { priority: "idle" },
          )) {
            if (cancelled) {
              break;
            }
            messageCount += 1;
            lastMessageTimeNs = message.timelineTimeNs;
            fetchedRows.push(...logConsoleRowsFromDecodedMessage(message));
          }
          if (cancelled) {
            break;
          }
          coveredRanges.push(
            coveredLogReadRange(
              range,
              messageCount,
              lastMessageTimeNs,
              LOG_READ_LIMIT,
            ),
          );
        }

        if (cancelled) {
          return;
        }

        fetchedWindowRef.current = {
          client,
          ranges: mergeLogReadRanges(coveredRanges, activeWindow),
          sourceKey,
          topicsKey: selectedTopicsKey,
        };
        setState((current) => {
          const merged = mergeBoundedLogRows(
            current.rawRows,
            fetchedRows,
            activeWindow,
            LOG_ROW_LIMIT,
          );
          return {
            rawRows: merged.rows,
            status: "ready",
            truncated: merged.truncated,
          };
        });
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            error: error instanceof Error ? error.message : String(error),
            rawRows: reusableWindow
              ? pruneLogRows(current.rawRows, activeWindow)
              : [],
            status: "error",
            truncated: reusableWindow ? current.truncated : false,
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeWindow,
    client,
    selectedLevels.length,
    selectedTopics,
    selectedTopicsKey,
    source,
    sourceKey,
  ]);

  const handleRowClick = useCallback(
    (row: McapLogConsoleRow) => {
      if (!timelineIndex) {
        return;
      }
      setCenterTimeNs(row.timeNs);
      seek(timelineIndex.nsToSec(row.timeNs));
    },
    [seek, timelineIndex],
  );

  const toggleTopic = useCallback(
    (topic: string, checked: boolean) => {
      setLogSettings({
        enabledTopics: checked
          ? [...new Set([...selectedTopics, topic])]
          : selectedTopics.filter((entry) => entry !== topic),
      });
    },
    [selectedTopics, setLogSettings],
  );

  const toggleLevel = useCallback(
    (level: McapLogLevel, checked: boolean) => {
      setLogSettings({
        selectedLevels: checked
          ? [...new Set([...selectedLevels, level])]
          : selectedLevels.filter((entry) => entry !== level),
      });
    },
    [selectedLevels, setLogSettings],
  );

  const timeOriginNs = timelineIndex?.startTimeNs;
  const showRowList =
    logSources.length > 0 && state.status !== "error" && rows.length > 0;
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

  // This effect measures the scroll viewport whenever the virtualized row
  // list mounts or resizes and disconnects the observer on cleanup.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }

    const publish = () => {
      setViewport({
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      });
    };
    publish();

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
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

  if (logSources.length === 0) {
    return (
      <div className={styles.body} data-testid="mcap-log-console-tile">
        <div className={styles.empty}>No log streams in this recording</div>
      </div>
    );
  }

  return (
    <div className={styles.body} data-testid="mcap-log-console-tile">
      <div className={styles.toolbar}>
        <div className={styles.controlGroup}>
          <Checkbox
            checked={followPlayhead}
            label="Follow"
            onChange={(checked) => setLogSettings({ followPlayhead: checked })}
            {...checkboxNoSpaceToggleProps}
          />
        </div>
        <div className={styles.controlGroup}>
          {MCAP_LOG_LEVELS.map((level) => (
            <Checkbox
              key={level}
              checked={selectedLevels.includes(level)}
              label={level}
              onChange={(checked) => toggleLevel(level, checked)}
              {...checkboxNoSpaceToggleProps}
            />
          ))}
        </div>
        {logSources.length > 1 ? (
          <div className={styles.controlGroup}>
            {logSources.map((logSource) => (
              <Checkbox
                key={logSource.id}
                checked={selectedTopics.includes(logSource.id)}
                label={logSource.label}
                onChange={(checked) => toggleTopic(logSource.id, checked)}
                {...checkboxNoSpaceToggleProps}
              />
            ))}
          </div>
        ) : null}
        <span className={styles.meta}>
          {state.status === "loading"
            ? "loading"
            : state.truncated
              ? `latest ${rows.length.toLocaleString()}`
              : rows.length.toLocaleString()}{" "}
          · {LOG_WINDOW_LABEL}
        </span>
      </div>
      {state.status === "error" ? (
        <div className={tileStyles.loading}>
          <span className={tileStyles.emptyTextError}>
            Could not read logs{state.error ? `: ${state.error}` : ""}
          </span>
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          {selectedTopics.length === 0 || selectedLevels.length === 0
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
                  onClick={() => handleRowClick(row)}
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
                    {row.groupLabel ?? row.topic}
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

function clipLogCacheWindow(
  cachedWindow: LogRowsCacheWindow,
  activeWindow: LogReadRange,
): LogRowsCacheWindow | null {
  const ranges = mergeLogReadRanges(cachedWindow.ranges, activeWindow);
  return ranges.length > 0 ? { ...cachedWindow, ranges } : null;
}

function formatRelativeTime(timeNs: bigint, originNs: bigint): string {
  const deltaNs = timeNs - originNs;
  const sign = deltaNs < 0n ? "-" : "";
  const absoluteNs = deltaNs < 0n ? -deltaNs : deltaNs;
  const seconds = absoluteNs / 1_000_000_000n;
  const millis = (absoluteNs % 1_000_000_000n) / 1_000_000n;
  return `${sign}${seconds.toString()}.${millis.toString().padStart(3, "0")}s`;
}

function formatWindowOffset(timeNs: bigint, windowStartNs: bigint): string {
  return `+${formatRelativeTime(timeNs, windowStartNs)}`;
}

function rowTitle(row: McapLogConsoleRow): string {
  const location =
    row.file && row.line !== undefined
      ? `${row.file}:${row.line}`
      : (row.file ?? null);
  const details =
    row.details.length > 0
      ? row.details.map((entry) => `${entry.key}=${entry.value}`).join(", ")
      : null;
  return [row.topic, row.groupLabel, location, row.functionName, details]
    .filter(Boolean)
    .join(" · ");
}

export default McapLogConsoleTile;
