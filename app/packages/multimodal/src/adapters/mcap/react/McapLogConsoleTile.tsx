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
  useMemo,
  useRef,
  useState,
} from "react";
import { byteSourceAccessKey } from "../../../query/bytes";
import { useSceneSourcesByType } from "../../../scene-inventory/SceneInventoryProvider";
import { MCAP_LOG_LEVELS, type McapLogLevel } from "../log-records";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { useMcapDataStream } from "./mcap-data-stream-context";
import {
  logConsoleRowsFromDecodedMessage,
  type McapLogConsoleRow,
} from "./mcap-log-console-rows";
import { useMcapLogConsoleContext } from "./mcap-log-console-context";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import styles from "./McapLogConsoleTile.module.css";
import tileStyles from "./McapTile.module.css";
import type { McapTileProps } from "./mcap-tile-types";

const PLAYHEAD_REFRESH_MS = 500;
const LOG_WINDOW_BEFORE_NS = 30_000_000_000n;
const LOG_WINDOW_AFTER_NS = 2_000_000_000n;
const LOG_WINDOW_LABEL = "32s";
const LOG_READ_LIMIT = 600;

interface LogRowsState {
  readonly error?: string;
  readonly rawRows: readonly McapLogConsoleRow[];
  readonly status: "idle" | "loading" | "ready" | "error";
}

interface LogRowsCacheWindow {
  readonly client: unknown;
  readonly ranges: readonly LogReadRange[];
  readonly sourceKey: string;
  readonly topicsKey: string;
}

interface LogReadRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

const INITIAL_ROWS: LogRowsState = { rawRows: [], status: "idle" };

const McapLogConsoleTile: React.FC<McapTileProps> = () => {
  const logSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.LOG);
  const { client, source } = useMcapLogConsoleContext();
  const dataStream = useMcapDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const setTileTitle = useSetTileTitle();
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [centerTimeNs, setCenterTimeNs] = useState<bigint | undefined>();
  const [selectedTopics, setSelectedTopics] = useState<readonly string[]>([]);
  const [selectedLevels, setSelectedLevels] =
    useState<readonly McapLogLevel[]>(MCAP_LOG_LEVELS);
  const [state, setState] = useState<LogRowsState>(INITIAL_ROWS);
  const fetchedWindowRef = useRef<LogRowsCacheWindow | null>(null);

  useEffect(() => {
    setTileTitle("Logs", { source: "auto" });
  }, [setTileTitle]);

  useEffect(() => {
    const ids = logSources.map((entry) => entry.id);
    setSelectedTopics((current) => {
      const valid = current.filter((topic) => ids.includes(topic));
      return valid.length > 0 ? valid : ids;
    });
  }, [logSources]);

  useEffect(() => {
    if (!followPlayhead || !timelineIndex) {
      return undefined;
    }

    let lastPublishMs = 0;
    const publish = () => {
      const now = Date.now();
      if (now - lastPublishMs < PLAYHEAD_REFRESH_MS) {
        return;
      }
      lastPublishMs = now;
      setCenterTimeNs(timelineIndex.nearestTick(getPlayhead(store)));
    };

    publish();
    return subscribePlayhead(store, publish);
  }, [followPlayhead, store, timelineIndex]);

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
  const windowStartNs =
    centerTimeNs !== undefined ? logWindowStartNs(centerTimeNs) : 0n;
  const windowEndNs =
    centerTimeNs !== undefined ? centerTimeNs + LOG_WINDOW_AFTER_NS : undefined;
  const rows = useMemo(
    () =>
      state.rawRows
        .filter(
          (row) =>
            selectedLevelSet.has(row.level) &&
            (windowEndNs === undefined ||
              (row.timeNs >= windowStartNs && row.timeNs <= windowEndNs)),
        )
        .sort((left, right) => compareBigInt(left.timeNs, right.timeNs)),
    [selectedLevelSet, state.rawRows, windowEndNs, windowStartNs],
  );

  useEffect(() => {
    if (
      !source ||
      !sourceKey ||
      centerTimeNs === undefined ||
      selectedTopics.length === 0
    ) {
      fetchedWindowRef.current = null;
      setState(INITIAL_ROWS);
      return undefined;
    }

    let cancelled = false;
    const activeWindow = logWindowForCenter(centerTimeNs);
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

    const ranges = missingLogReadRanges(reusableWindow, activeWindow);

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
      setState({ rawRows: [], status: "loading" });
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
            { priority: "current" },
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
            coveredLogReadRange(range, messageCount, lastMessageTimeNs),
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
        setState((current) => ({
          rawRows: mergeLogRows(current.rawRows, fetchedRows, activeWindow),
          status: "ready",
        }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            error: error instanceof Error ? error.message : String(error),
            rawRows: reusableWindow
              ? pruneLogRows(current.rawRows, activeWindow)
              : [],
            status: "error",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    centerTimeNs,
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

  const toggleTopic = useCallback((topic: string, checked: boolean) => {
    setSelectedTopics((current) =>
      checked
        ? [...new Set([...current, topic])]
        : current.filter((entry) => entry !== topic),
    );
  }, []);

  const toggleLevel = useCallback((level: McapLogLevel, checked: boolean) => {
    setSelectedLevels((current) =>
      checked
        ? [...new Set([...current, level])]
        : current.filter((entry) => entry !== level),
    );
  }, []);

  const timeOriginNs = timelineIndex?.startTimeNs;

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
            onChange={setFollowPlayhead}
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
          {state.status === "loading" ? "loading" : rows.length} ·{" "}
          {LOG_WINDOW_LABEL}
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
        <div className={styles.scroll}>
          {rows.map((row) => (
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
      )}
    </div>
  );
};

function logWindowStartNs(centerTimeNs: bigint): bigint {
  return centerTimeNs > LOG_WINDOW_BEFORE_NS
    ? centerTimeNs - LOG_WINDOW_BEFORE_NS
    : 0n;
}

function logWindowForCenter(centerTimeNs: bigint): LogReadRange {
  return {
    endTimeNs: centerTimeNs + LOG_WINDOW_AFTER_NS,
    startTimeNs: logWindowStartNs(centerTimeNs),
  };
}

function clipLogCacheWindow(
  cachedWindow: LogRowsCacheWindow,
  activeWindow: LogReadRange,
): LogRowsCacheWindow | null {
  const ranges = mergeLogReadRanges(cachedWindow.ranges, activeWindow);
  return ranges.length > 0 ? { ...cachedWindow, ranges } : null;
}

function missingLogReadRanges(
  cachedWindow: LogRowsCacheWindow | null,
  activeWindow: LogReadRange,
): readonly LogReadRange[] {
  if (!cachedWindow) {
    return [activeWindow];
  }

  const ranges: LogReadRange[] = [];
  let cursor = activeWindow.startTimeNs;
  for (const covered of cachedWindow.ranges) {
    if (covered.startTimeNs > cursor) {
      ranges.push({ endTimeNs: covered.startTimeNs, startTimeNs: cursor });
    }
    if (covered.endTimeNs > cursor) {
      cursor = covered.endTimeNs;
    }
    if (cursor >= activeWindow.endTimeNs) {
      break;
    }
  }
  if (cursor < activeWindow.endTimeNs) {
    ranges.push({ endTimeNs: activeWindow.endTimeNs, startTimeNs: cursor });
  }

  return ranges;
}

function coveredLogReadRange(
  range: LogReadRange,
  messageCount: number,
  lastMessageTimeNs: bigint | undefined,
): LogReadRange {
  if (messageCount >= LOG_READ_LIMIT && lastMessageTimeNs !== undefined) {
    return {
      endTimeNs: minBigInt(lastMessageTimeNs, range.endTimeNs),
      startTimeNs: range.startTimeNs,
    };
  }

  return range;
}

function mergeLogReadRanges(
  ranges: readonly LogReadRange[],
  activeWindow: LogReadRange,
): readonly LogReadRange[] {
  const clippedRanges: LogReadRange[] = [];
  for (const range of ranges) {
    const startTimeNs = maxBigInt(range.startTimeNs, activeWindow.startTimeNs);
    const endTimeNs = minBigInt(range.endTimeNs, activeWindow.endTimeNs);
    if (startTimeNs <= endTimeNs) {
      clippedRanges.push({ endTimeNs, startTimeNs });
    }
  }
  clippedRanges.sort((left, right) =>
    compareBigInt(left.startTimeNs, right.startTimeNs),
  );

  const merged: LogReadRange[] = [];
  for (const range of clippedRanges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startTimeNs > previous.endTimeNs) {
      merged.push(range);
      continue;
    }
    if (range.endTimeNs > previous.endTimeNs) {
      merged[merged.length - 1] = {
        ...previous,
        endTimeNs: range.endTimeNs,
      };
    }
  }

  return merged;
}

function mergeLogRows(
  current: readonly McapLogConsoleRow[],
  incoming: readonly McapLogConsoleRow[],
  activeWindow: LogReadRange,
): readonly McapLogConsoleRow[] {
  const retainedRows = pruneLogRows(current, activeWindow);
  if (incoming.length === 0) {
    return retainedRows;
  }

  const rowsById = new Map(retainedRows.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (logRowInWindow(row, activeWindow)) {
      rowsById.set(row.id, row);
    }
  }
  return Array.from(rowsById.values());
}

function pruneLogRows(
  rows: readonly McapLogConsoleRow[],
  activeWindow: LogReadRange,
): readonly McapLogConsoleRow[] {
  const retainedRows = rows.filter((row) => logRowInWindow(row, activeWindow));
  return retainedRows.length === rows.length ? rows : retainedRows;
}

function logRowInWindow(
  row: McapLogConsoleRow,
  activeWindow: LogReadRange,
): boolean {
  return (
    row.timeNs >= activeWindow.startTimeNs &&
    row.timeNs <= activeWindow.endTimeNs
  );
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
