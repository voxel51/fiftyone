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
  readonly endTimeNs: bigint;
  readonly sourceKey: string;
  readonly startTimeNs: bigint;
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
    if (selectedLevels.length === 0) {
      setState((current) =>
        current.status === "loading"
          ? { ...current, error: undefined, status: "ready" }
          : current,
      );
      return undefined;
    }

    let cancelled = false;
    const startTimeNs = logWindowStartNs(centerTimeNs);
    const endTimeNs = centerTimeNs + LOG_WINDOW_AFTER_NS;
    const cachedWindow = fetchedWindowRef.current;
    const reusableWindow =
      cachedWindow?.client === client &&
      cachedWindow.sourceKey === sourceKey &&
      cachedWindow.topicsKey === selectedTopicsKey
        ? cachedWindow
        : null;
    const ranges = missingLogReadRanges(reusableWindow, startTimeNs, endTimeNs);

    if (ranges.length === 0) {
      setState((current) =>
        current.status === "ready"
          ? current
          : { ...current, error: undefined, status: "ready" },
      );
      return undefined;
    }

    if (!reusableWindow) {
      fetchedWindowRef.current = null;
      setState({ rawRows: [], status: "loading" });
    } else {
      setState((current) => ({
        ...current,
        error: undefined,
        status: "loading",
      }));
    }

    void (async () => {
      try {
        const fetchedRows: McapLogConsoleRow[] = [];
        for (const range of ranges) {
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
            fetchedRows.push(...logConsoleRowsFromDecodedMessage(message));
          }
          if (cancelled) {
            break;
          }
        }

        if (cancelled) {
          return;
        }

        fetchedWindowRef.current = {
          client,
          endTimeNs: maxBigInt(reusableWindow?.endTimeNs, endTimeNs),
          sourceKey,
          startTimeNs: minBigInt(reusableWindow?.startTimeNs, startTimeNs),
          topicsKey: selectedTopicsKey,
        };
        setState((current) => ({
          rawRows: reusableWindow
            ? mergeLogRows(current.rawRows, fetchedRows)
            : fetchedRows,
          status: "ready",
        }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            error: error instanceof Error ? error.message : String(error),
            rawRows: reusableWindow ? current.rawRows : [],
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

function missingLogReadRanges(
  cachedWindow: LogRowsCacheWindow | null,
  startTimeNs: bigint,
  endTimeNs: bigint,
): readonly LogReadRange[] {
  if (!cachedWindow) {
    return [{ endTimeNs, startTimeNs }];
  }

  const ranges: LogReadRange[] = [];
  if (startTimeNs < cachedWindow.startTimeNs) {
    ranges.push({ endTimeNs: cachedWindow.startTimeNs, startTimeNs });
  }
  if (endTimeNs > cachedWindow.endTimeNs) {
    ranges.push({ endTimeNs, startTimeNs: cachedWindow.endTimeNs });
  }

  return ranges;
}

function mergeLogRows(
  current: readonly McapLogConsoleRow[],
  incoming: readonly McapLogConsoleRow[],
): readonly McapLogConsoleRow[] {
  if (incoming.length === 0) {
    return current;
  }

  const rowsById = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    rowsById.set(row.id, row);
  }
  return Array.from(rowsById.values());
}

function minBigInt(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint {
  if (left === undefined) {
    return right ?? 0n;
  }
  if (right === undefined) {
    return left;
  }
  return left < right ? left : right;
}

function maxBigInt(
  left: bigint | undefined,
  right: bigint | undefined,
): bigint {
  if (left === undefined) {
    return right ?? 0n;
  }
  if (right === undefined) {
    return left;
  }
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
