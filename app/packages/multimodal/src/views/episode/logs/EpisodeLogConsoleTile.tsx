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
import { useSceneSourcesByType } from "../../../scene-inventory/SceneInventoryProvider";
import { LOG_LEVELS, type LogLevel } from "../../../ir";
import {
  useEpisodeLogTileSettings,
  useSetEpisodeLogTileSettings,
} from "./episode-log-tile-state";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useEpisodeDataStream } from "../playback/episode-data-stream-context";
import {
  logConsoleRowsFromDecodedMessage,
  type EpisodeLogConsoleRow,
} from "../../../visualization/logs/log-console-rows";
import LogConsole from "../../../visualization/logs/LogConsole";
import { useEpisodeLogConsoleContext } from "./episode-log-console-context";
import {
  coveredLogReadRange,
  logWindowForCenter,
  mergeBoundedLogRows,
  mergeLogReadRanges,
  missingLogReadRanges,
  pruneLogRows,
  type LogReadRange,
} from "./episode-log-console-window";
import type { EpisodeTileProps } from "../tiles/episode-tile-types";

const PLAYHEAD_REFRESH_MS = 500;
const LOG_WINDOW_BEFORE_NS = 30_000_000_000n;
const LOG_WINDOW_AFTER_NS = 2_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const LOG_WINDOW_LABEL = `${
  (LOG_WINDOW_BEFORE_NS + LOG_WINDOW_AFTER_NS) / NANOSECONDS_PER_SECOND
}s`;
const LOG_READ_LIMIT = 600;
const LOG_ROW_LIMIT = 2_000;

interface LogRowsState {
  readonly error?: string;
  readonly rawRows: readonly EpisodeLogConsoleRow[];
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly truncated: boolean;
}

interface LogRowsCacheWindow {
  readonly ranges: readonly LogReadRange[];
  readonly session: unknown;
  readonly sourceKey: string;
  readonly streamsKey: string;
}

const INITIAL_ROWS: LogRowsState = {
  rawRows: [],
  status: "idle",
  truncated: false,
};

const EpisodeLogConsoleTile: React.FC<EpisodeTileProps> = () => {
  const logSources = useSceneSourcesByType(SCENE_SOURCE_TYPE.LOG);
  const { session, sourceKey } = useEpisodeLogConsoleContext();
  const dataStream = useEpisodeDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const setTileTitle = useSetTileTitle();
  const { enabledStreams, followPlayhead, selectedLevels } =
    useEpisodeLogTileSettings();
  const setLogSettings = useSetEpisodeLogTileSettings();
  const [centerTimeNs, setCenterTimeNs] = useState<bigint | undefined>();
  const [state, setState] = useState<LogRowsState>(INITIAL_ROWS);
  const lastPlayheadPublishMsRef = useRef(0);
  const fetchedWindowRef = useRef<LogRowsCacheWindow | null>(null);

  // This effect keeps the automatic tile title aligned with the panel's role.
  useEffect(() => {
    setTileTitle("Logs", { source: "auto" });
  }, [setTileTitle]);

  const selectedStreams = useMemo(() => {
    const ids = logSources.map((entry) => entry.id);
    if (enabledStreams === undefined) return ids;
    const valid = enabledStreams.filter((stream) => ids.includes(stream));
    return valid.length > 0 ? valid : ids;
  }, [enabledStreams, logSources]);

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
    if (
      !session ||
      !sourceKey ||
      !activeWindow ||
      selectedStreams.length === 0
    ) {
      fetchedWindowRef.current = null;
      setState(INITIAL_ROWS);
      return undefined;
    }

    let cancelled = false;
    const cachedWindow = fetchedWindowRef.current;
    const reusableWindow =
      cachedWindow?.session === session &&
      cachedWindow.sourceKey === sourceKey &&
      cachedWindow.streamsKey === selectedStreamsKey
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
        const fetchedRows: EpisodeLogConsoleRow[] = [];
        for (const range of ranges) {
          let messageCount = 0;
          let lastMessageTimeNs: bigint | undefined;
          for await (const batch of session.read({
            limit: LOG_READ_LIMIT,
            priority: "idle",
            streams: selectedStreams,
            window: { endNs: range.endTimeNs, startNs: range.startTimeNs },
          })) {
            for (const message of batch.frames) {
              if (cancelled) break;
              messageCount += 1;
              lastMessageTimeNs = message.timestampNs;
              fetchedRows.push(...logConsoleRowsFromDecodedMessage(message));
            }
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
          ranges: mergeLogReadRanges(coveredRanges, activeWindow),
          session,
          sourceKey,
          streamsKey: selectedStreamsKey,
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
    session,
    selectedLevels.length,
    selectedStreams,
    selectedStreamsKey,
    sourceKey,
  ]);

  const handleRowClick = useCallback(
    (row: EpisodeLogConsoleRow) => {
      if (!timelineIndex) {
        return;
      }
      setCenterTimeNs(row.timeNs);
      seek(timelineIndex.nsToSec(row.timeNs));
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
      rows={rows}
      selectedLevels={selectedLevels}
      selectedStreams={selectedStreams}
      sources={logSources}
      status={state.status}
      timeOriginNs={timeOriginNs}
      truncated={state.truncated}
      windowLabel={LOG_WINDOW_LABEL}
      windowStartNs={windowStartNs}
    />
  );
};

function clipLogCacheWindow(
  cachedWindow: LogRowsCacheWindow,
  activeWindow: LogReadRange,
): LogRowsCacheWindow | null {
  const ranges = mergeLogReadRanges(cachedWindow.ranges, activeWindow);
  return ranges.length > 0 ? { ...cachedWindow, ranges } : null;
}

export default EpisodeLogConsoleTile;
