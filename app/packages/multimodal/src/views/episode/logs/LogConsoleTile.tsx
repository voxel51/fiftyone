import {
  getPlayhead,
  subscribePlayhead,
  usePlayback,
  usePlaybackStore,
} from "@fiftyone/playback";
import { useSetTileTitle } from "@fiftyone/tiling";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LOG_LEVELS, SCENE_SOURCE_TYPE, type LogLevel } from "../../../ir";
import type { FrameBatch } from "../../../ports";
import type { ProgressiveHistoryAccumulator } from "../../../runtime/progressive-history";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import LogConsole from "../../../visualization/logs/LogConsole";
import {
  logConsoleRowsFromDecodedMessage,
  type EpisodeLogConsoleRow,
} from "../../../visualization/logs/log-console-rows";
import { shouldDeferBulkHistory } from "../playback/bulk-stream-lifecycle";
import { useDataStream } from "../playback/data-stream-context";
import { useProgressiveHistories } from "../playback/use-progressive-history";
import type { EpisodeTileProps } from "../tiles/tile-types";
import { useLogConsoleContext } from "./log-console-context";
import {
  logWindowForCenter,
  mergeSelectedBoundedLogRows,
  type LogReadRange,
} from "./log-console-window";
import { useLogTileSettings, useSetLogTileSettings } from "./log-tile-state";

const PLAYHEAD_REFRESH_MS = 500;
const LOG_WINDOW_BEFORE_NS = 30_000_000_000n;
const LOG_WINDOW_AFTER_NS = 2_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const LOG_WINDOW_LABEL = `${
  (LOG_WINDOW_BEFORE_NS + LOG_WINDOW_AFTER_NS) / NANOSECONDS_PER_SECOND
}s`;
const LOG_FALLBACK_TILE_READ_LIMIT = 600;
const LOG_SELECTED_ROW_LIMIT = 2_000;
const LOG_HISTORY_TILE_NS = 4_000_000_000n;
const LOG_HISTORY_TILE_ITEM_LIMIT = 5_000;
const LOG_HISTORY_RETRY_MS = 2_000;
const LOG_HISTORY_GRANT_BUDGET = {
  maxMessages: 2_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 500,
} as const;

interface LogRowsState {
  readonly error?: string;
  readonly rawRows: readonly EpisodeLogConsoleRow[];
  readonly retentionTruncated: boolean;
  readonly searchIncomplete: boolean;
  readonly status: "idle" | "loading" | "ready" | "error";
}

const INITIAL_ROWS: LogRowsState = {
  rawRows: [],
  retentionTruncated: false,
  searchIncomplete: false,
  status: "idle",
};

const LogConsoleTile: React.FC<EpisodeTileProps> = () => {
  const logSources = useSceneSourcesByType(SCENE_SOURCE_TYPE.LOG);
  const { budgetAccount, session, sourceKey } = useLogConsoleContext();
  const dataStream = useDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const setTileTitle = useSetTileTitle();
  const { enabledStreams, followPlayhead, selectedLevels } =
    useLogTileSettings();
  const setLogSettings = useSetLogTileSettings();
  const [centerTimeNs, setCenterTimeNs] = useState<bigint | undefined>();
  const lastPlayheadPublishMsRef = useRef(0);

  useEffect(() => {
    setTileTitle("Logs", { source: "auto" });
  }, [setTileTitle]);

  const selectedStreams = useMemo(() => {
    const ids = logSources.map((entry) => entry.id);
    if (enabledStreams === undefined) return ids;
    const valid = enabledStreams.filter((stream) => ids.includes(stream));
    return valid.length > 0 ? valid : ids;
  }, [enabledStreams, logSources]);

  useEffect(() => {
    lastPlayheadPublishMsRef.current = 0;
  }, [followPlayhead, store, timelineIndex]);

  // Stable progressive-history jobs deduplicate overlap, so Follow can keep
  // advancing while older bounded grants land.
  useEffect(() => {
    if (!followPlayhead || !timelineIndex) return undefined;

    const publish = () => {
      const now = Date.now();
      if (now - lastPlayheadPublishMsRef.current < PLAYHEAD_REFRESH_MS) return;
      lastPlayheadPublishMsRef.current = now;
      setCenterTimeNs(timelineIndex.nearestTick(getPlayhead(store)));
    };

    publish();
    return subscribePlayhead(store, publish);
  }, [followPlayhead, store, timelineIndex]);

  // A non-following tile still opens around the current visible playhead. In
  // Follow mode the subscription effect above owns this same initialization.
  useEffect(() => {
    if (centerTimeNs === undefined && timelineIndex && !followPlayhead) {
      setCenterTimeNs(timelineIndex.nearestTick(getPlayhead(store)));
    }
  }, [centerTimeNs, followPlayhead, store, timelineIndex]);

  const selectedLevelSet = useMemo(
    () => new Set(selectedLevels),
    [selectedLevels],
  );
  const selectedStreamsKey = useMemo(
    () => [...selectedStreams].sort().join("\0"),
    [selectedStreams],
  );
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
  const logJobConfigs = useMemo(() => {
    if (!activeWindow || !session || selectedStreams.length === 0) return [];
    return logHistoryTileWindows(
      activeWindow,
      session.manifest?.timeRange ?? {
        endNs: activeWindow.endTimeNs,
        startNs: activeWindow.startTimeNs,
      },
      LOG_HISTORY_TILE_NS,
      centerTimeNs ?? activeWindow.startTimeNs,
    ).map((window) => ({
      accumulator: LOG_HISTORY_ACCUMULATOR,
      budget: LOG_HISTORY_GRANT_BUDGET,
      fallback: {
        maxMessagesPerStream: LOG_FALLBACK_TILE_READ_LIMIT,
        tileDurationNs: LOG_HISTORY_TILE_NS,
      },
      family: "log" as const,
      key: `${selectedStreamsKey}\0${window.startNs}:${window.endNs}`,
      maxItems: LOG_HISTORY_TILE_ITEM_LIMIT,
      preferredTimeNs: window.startNs + (window.endNs - window.startNs) / 2n,
      priority: "idle" as const,
      streams: selectedStreams,
      traversal: "center-out" as const,
      window,
    }));
  }, [
    activeWindow,
    centerTimeNs,
    selectedStreams,
    selectedStreamsKey,
    session,
  ]);
  const logProgress = useProgressiveHistories({
    account: budgetAccount,
    configs: logJobConfigs,
    enabled: selectedLevels.length > 0,
    retryDelayMs: LOG_HISTORY_RETRY_MS,
    session,
    shouldStandDown: () => shouldDeferBulkHistory(store),
  });
  const state = useMemo<LogRowsState>(() => {
    if (
      !session ||
      !sourceKey ||
      !activeWindow ||
      selectedStreams.length === 0
    ) {
      return INITIAL_ROWS;
    }
    const merged = mergeSelectedBoundedLogRows(
      [],
      logProgress.flatMap((progress) => progress.value),
      activeWindow,
      LOG_SELECTED_ROW_LIMIT,
      selectedLevelSet,
    );
    if (selectedLevels.length === 0) {
      return {
        rawRows: merged.rows,
        retentionTruncated: merged.truncated,
        searchIncomplete: false,
        status: "ready",
      };
    }
    const error = logProgress.find((progress) => progress.error)?.error;
    const loading = logProgress.some(
      (progress) => progress.status === "idle" || progress.status === "loading",
    );
    return {
      ...(error ? { error } : {}),
      rawRows: merged.rows,
      retentionTruncated: merged.truncated,
      // A terminal progressive-history truncation means some part of the
      // source window was not searched, independent of the visible row cap.
      searchIncomplete: logProgress.some((progress) => progress.truncated),
      status:
        error && merged.rows.length === 0
          ? "error"
          : loading
            ? "loading"
            : "ready",
    };
  }, [
    activeWindow,
    logProgress,
    selectedLevelSet,
    selectedLevels.length,
    selectedStreams.length,
    session,
    sourceKey,
  ]);
  const windowStartNs = activeWindow?.startTimeNs ?? 0n;
  const windowEndNs = activeWindow?.endTimeNs;
  const rows = useMemo(
    () =>
      state.rawRows.filter(
        (row) =>
          windowEndNs === undefined ||
          (row.timelineTimeNs >= windowStartNs &&
            row.timelineTimeNs <= windowEndNs),
      ),
    [state.rawRows, windowEndNs, windowStartNs],
  );

  const handleRowClick = useCallback(
    (row: EpisodeLogConsoleRow) => {
      if (!timelineIndex) return;
      setCenterTimeNs(row.timelineTimeNs);
      seek(timelineIndex.nsToSec(row.timelineTimeNs));
    },
    [seek, timelineIndex],
  );

  const toggleStream = useCallback(
    (stream: string, checked: boolean) => {
      setLogSettings({
        enabledStreams: checked
          ? [...new Set([...selectedStreams, stream])]
          : selectedStreams.filter((entry) => entry !== stream),
      });
    },
    [selectedStreams, setLogSettings],
  );

  const toggleLevel = useCallback(
    (level: LogLevel, checked: boolean) => {
      setLogSettings({
        selectedLevels: checked
          ? [...new Set([...selectedLevels, level])]
          : selectedLevels.filter((entry) => entry !== level),
      });
    },
    [selectedLevels, setLogSettings],
  );

  const timeOriginNs = timelineIndex?.startTimeNs;
  return (
    <LogConsole
      error={state.error}
      followPlayhead={followPlayhead}
      levels={LOG_LEVELS}
      onFollowPlayheadChange={(follow) =>
        setLogSettings({ followPlayhead: follow })
      }
      onLevelChange={toggleLevel}
      onRowClick={handleRowClick}
      onStreamChange={toggleStream}
      retentionTruncated={state.retentionTruncated}
      rows={rows}
      searchIncomplete={state.searchIncomplete}
      selectedLevels={selectedLevels}
      selectedStreams={selectedStreams}
      sources={logSources}
      status={state.status}
      tailTimeNs={centerTimeNs}
      timeOriginNs={timeOriginNs}
      windowLabel={LOG_WINDOW_LABEL}
      windowStartNs={windowStartNs}
    />
  );
};

const LOG_HISTORY_ACCUMULATOR = {
  initialValue: [] as readonly EpisodeLogConsoleRow[],
  consume(
    current: readonly EpisodeLogConsoleRow[],
    batches: readonly FrameBatch[],
  ) {
    const rows: EpisodeLogConsoleRow[] = current.slice();
    for (const batch of batches) {
      for (const frame of batch.frames) {
        rows.push(...logConsoleRowsFromDecodedMessage(frame));
      }
    }
    return { itemCount: rows.length, value: rows };
  },
} satisfies ProgressiveHistoryAccumulator<readonly EpisodeLogConsoleRow[]>;

function logHistoryTileWindows(
  activeWindow: LogReadRange,
  manifestWindow: { readonly endNs: bigint; readonly startNs: bigint },
  tileDurationNs: bigint,
  preferredTimeNs: bigint,
): readonly { readonly endNs: bigint; readonly startNs: bigint }[] {
  if (tileDurationNs <= 0n) return [];
  if (manifestWindow.endNs < manifestWindow.startNs) return [];
  const startNs =
    activeWindow.startTimeNs > manifestWindow.startNs
      ? activeWindow.startTimeNs
      : manifestWindow.startNs;
  const endNs =
    activeWindow.endTimeNs < manifestWindow.endNs
      ? activeWindow.endTimeNs
      : manifestWindow.endNs;
  if (endNs < startNs) return [];
  const origin = manifestWindow.startNs;
  const firstIndex = (startNs - origin) / tileDurationNs;
  const windows: Array<{ endNs: bigint; startNs: bigint }> = [];
  // Manifest-aligned tiles intentionally extend beyond the active viewport.
  // Stable boundaries retain paid work across follow updates; rows are
  // filtered back to the exact active window before rendering.
  for (
    let tileStartNs = origin + firstIndex * tileDurationNs;
    tileStartNs <= endNs;
    tileStartNs += tileDurationNs
  ) {
    const tileEndNs = tileStartNs + tileDurationNs - 1n;
    windows.push({
      endNs:
        tileEndNs < manifestWindow.endNs ? tileEndNs : manifestWindow.endNs,
      startNs: tileStartNs,
    });
  }
  return windows.sort((left, right) => {
    const leftDistance = distanceToLogWindow(left, preferredTimeNs);
    const rightDistance = distanceToLogWindow(right, preferredTimeNs);
    if (leftDistance !== rightDistance) {
      return leftDistance < rightDistance ? -1 : 1;
    }
    return left.startNs < right.startNs
      ? -1
      : left.startNs > right.startNs
        ? 1
        : 0;
  });
}

function distanceToLogWindow(
  window: { readonly endNs: bigint; readonly startNs: bigint },
  timeNs: bigint,
): bigint {
  if (timeNs < window.startNs) return window.startNs - timeNs;
  if (timeNs > window.endNs) return timeNs - window.endNs;
  return 0n;
}

export default LogConsoleTile;
