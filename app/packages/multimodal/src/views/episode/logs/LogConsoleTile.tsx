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
import { DiagnosticStateProjector } from "../../../visualization/logs/diagnostic-console-state";
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
  logWindowStartNs,
  orderedUniqueLogRows,
  selectBoundedLogRows,
  type LogReadRange,
} from "./log-console-window";
import { useLogTileSettings, useSetLogTileSettings } from "./log-tile-state";
import {
  diagnosticStreamIds,
  type DiagnosticSeedState,
  useDiagnosticSeed,
} from "./use-diagnostic-seed";

const PLAYHEAD_REFRESH_MS = 500;
const LOG_WINDOW_BEFORE_NS = 30_000_000_000n;
const LOG_PREFETCH_AFTER_NS = 2_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const LOG_WINDOW_LABEL = `${LOG_WINDOW_BEFORE_NS / NANOSECONDS_PER_SECOND}s history`;
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

interface LogEvidenceState {
  readonly error?: string;
  readonly orderedEvents: readonly EpisodeLogConsoleRow[];
  readonly searchIncomplete: boolean;
  readonly status: "idle" | "loading" | "ready" | "error";
}

const INITIAL_EVIDENCE: LogEvidenceState = {
  orderedEvents: [],
  searchIncomplete: false,
  status: "idle",
};

interface LogHorizon {
  readonly generation: number;
  readonly playheadTimeNs: bigint;
  readonly seedTimeNs?: bigint;
  readonly scopeKey: string;
}

const LogConsoleTile: React.FC<EpisodeTileProps> = () => {
  const logSources = useSceneSourcesByType(SCENE_SOURCE_TYPE.LOG);
  const { budgetAccount, session, sourceKey } = useLogConsoleContext();
  const dataStream = useDataStream();
  const timelineIndex = dataStream?.getTimelineIndex() ?? null;
  const store = usePlaybackStore();
  const { seek } = usePlayback();
  const setTileTitle = useSetTileTitle();
  const {
    enabledDiagnosticStreams,
    enabledStreams,
    followPlayhead,
    selectedLevels,
    viewMode,
  } = useLogTileSettings();
  const setLogSettings = useSetLogTileSettings();
  const [horizon, setHorizon] = useState<LogHorizon | undefined>();
  const [diagnosticProjector] = useState(() => new DiagnosticStateProjector());
  const lastPlayheadPublishMsRef = useRef(0);
  const recordingStartNs = session?.manifest.timeRange.startNs ?? 0n;
  const centerTimeNs = horizon?.playheadTimeNs;
  const allSourceIds = useMemo(
    () => logSources.map((source) => source.id),
    [logSources],
  );
  const allDiagnosticStreamIds = useMemo(
    () => diagnosticStreamIds(session, allSourceIds),
    [allSourceIds, session],
  );
  const diagnosticStreamIdSet = useMemo(
    () => new Set(allDiagnosticStreamIds),
    [allDiagnosticStreamIds],
  );
  const sources = useMemo(
    () =>
      logSources.filter((source) =>
        viewMode === "diagnostics"
          ? diagnosticStreamIdSet.has(source.id)
          : !diagnosticStreamIdSet.has(source.id),
      ),
    [diagnosticStreamIdSet, logSources, viewMode],
  );
  const configuredStreams =
    viewMode === "diagnostics" ? enabledDiagnosticStreams : enabledStreams;
  const selectedStreams = useMemo(() => {
    const ids = sources.map((source) => source.id);
    if (configuredStreams === undefined) return ids;
    const validIds = new Set(ids);
    // An explicit empty list means no streams. Never turn a deliberate
    // deselection into "all", which previously coupled diagnostics topics.
    return configuredStreams.filter((stream) => validIds.has(stream));
  }, [configuredStreams, sources]);
  const selectedStreamsKey = useMemo(
    () => [...selectedStreams].sort().join("\0"),
    [selectedStreams],
  );
  const sourceScopeKey = `${sourceKey ?? ""}\0${viewMode}\0${selectedStreamsKey}`;

  const moveHorizon = useCallback(
    (playheadTimeNs: bigint, forceNewGeneration = false) => {
      setHorizon((current) =>
        nextLogHorizon(
          current,
          playheadTimeNs,
          recordingStartNs,
          forceNewGeneration,
          sourceScopeKey,
        ),
      );
    },
    [recordingStartNs, sourceScopeKey],
  );

  useEffect(() => {
    setTileTitle("Logs / Diagnostics", { source: "auto" });
  }, [setTileTitle]);

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
      const playheadTimeNs = timelineIndex.nearestTick(getPlayhead(store));
      if (playheadTimeNs !== undefined) moveHorizon(playheadTimeNs);
    };

    publish();
    return subscribePlayhead(store, publish);
  }, [followPlayhead, moveHorizon, store, timelineIndex]);

  // A non-following tile still opens around the current visible playhead. In
  // Follow mode the subscription effect above owns this same initialization.
  useEffect(() => {
    if (centerTimeNs === undefined && timelineIndex && !followPlayhead) {
      const playheadTimeNs = timelineIndex.nearestTick(getPlayhead(store));
      if (playheadTimeNs !== undefined) moveHorizon(playheadTimeNs);
    }
  }, [centerTimeNs, followPlayhead, moveHorizon, store, timelineIndex]);

  const selectedLevelSet = useMemo(
    () => new Set(selectedLevels),
    [selectedLevels],
  );
  const previousSourceScopeRef = useRef(sourceScopeKey);
  const sourceScopeReady = horizon?.scopeKey === sourceScopeKey;
  // This effect invalidates retained history when the active view or source
  // selection changes.
  useEffect(() => {
    if (previousSourceScopeRef.current === sourceScopeKey) return;
    previousSourceScopeRef.current = sourceScopeKey;
    if (centerTimeNs !== undefined) moveHorizon(centerTimeNs, true);
  }, [centerTimeNs, moveHorizon, sourceScopeKey]);
  const readWindow = useMemo(
    () =>
      centerTimeNs === undefined
        ? null
        : logWindowForCenter(
            centerTimeNs,
            LOG_WINDOW_BEFORE_NS,
            LOG_PREFETCH_AFTER_NS,
          ),
    [centerTimeNs],
  );
  const visibleWindow = useMemo(
    () =>
      centerTimeNs === undefined
        ? null
        : logWindowForCenter(centerTimeNs, LOG_WINDOW_BEFORE_NS, 0n),
    [centerTimeNs],
  );
  const logJobConfigs = useMemo(() => {
    if (!readWindow || !session || selectedStreams.length === 0) return [];
    return logHistoryTileWindows(
      readWindow,
      session.manifest.timeRange,
      LOG_HISTORY_TILE_NS,
      centerTimeNs ?? readWindow.startTimeNs,
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
  }, [centerTimeNs, readWindow, selectedStreams, selectedStreamsKey, session]);
  const logProgress = useProgressiveHistories({
    account: budgetAccount,
    configs: logJobConfigs,
    enabled: viewMode === "diagnostics" || selectedLevels.length > 0,
    retryDelayMs: LOG_HISTORY_RETRY_MS,
    session,
    shouldStandDown: () => shouldDeferBulkHistory(store),
  });
  const hasReadWindow = readWindow !== null;
  const orderedEvents = useMemo(
    () => orderedUniqueLogRows(logProgress.map((progress) => progress.value)),
    [logProgress],
  );
  const evidence = useMemo<LogEvidenceState>(() => {
    if (
      !session ||
      !sourceKey ||
      !hasReadWindow ||
      selectedStreams.length === 0
    ) {
      return INITIAL_EVIDENCE;
    }
    const historyEnabled =
      viewMode === "diagnostics" || selectedLevels.length > 0;
    if (!historyEnabled) {
      return {
        orderedEvents,
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
      orderedEvents,
      // A terminal progressive-history truncation means some part of the
      // source window was not searched, independent of the visible row cap.
      searchIncomplete:
        Boolean(error) || logProgress.some((progress) => progress.truncated),
      status:
        error && orderedEvents.length === 0
          ? "error"
          : loading
            ? "loading"
            : "ready",
    };
  }, [
    hasReadWindow,
    logProgress,
    orderedEvents,
    selectedLevels.length,
    selectedStreams.length,
    session,
    sourceKey,
    viewMode,
  ]);
  const logRows = useMemo(
    () =>
      visibleWindow
        ? selectBoundedLogRows(
            evidence.orderedEvents,
            visibleWindow,
            LOG_SELECTED_ROW_LIMIT,
            selectedLevelSet,
          )
        : { rows: [], truncated: false },
    [evidence.orderedEvents, selectedLevelSet, visibleWindow],
  );
  const diagnosticStreams = useMemo(
    () => diagnosticStreamIds(session, selectedStreams),
    [selectedStreams, session],
  );
  const diagnosticGeneration = `${sourceScopeKey}\0${horizon?.generation ?? 0}`;
  const diagnosticSeed = useDiagnosticSeed({
    enabled: viewMode === "diagnostics" && sourceScopeReady,
    generation: diagnosticGeneration,
    seedTimeNs: horizon?.seedTimeNs,
    session,
    streams: diagnosticStreams,
  });
  const diagnosticCoverage = diagnosticCoverageState(evidence, diagnosticSeed);
  const diagnostics = useMemo(
    () =>
      viewMode !== "diagnostics" ||
      !sourceScopeReady ||
      centerTimeNs === undefined
        ? []
        : diagnosticProjector.project({
            generation: diagnosticGeneration,
            orderedEvents: evidence.orderedEvents,
            playheadTimeNs: centerTimeNs,
            seedEvents: diagnosticSeed.rows,
            sourceCoverage: diagnosticCoverage,
          }),
    [
      centerTimeNs,
      diagnosticCoverage,
      diagnosticGeneration,
      diagnosticProjector,
      sourceScopeReady,
      diagnosticSeed.rows,
      evidence.orderedEvents,
      viewMode,
    ],
  );
  const windowStartNs = visibleWindow?.startTimeNs ?? recordingStartNs;
  const panelStatus =
    viewMode === "diagnostics" &&
    (!sourceScopeReady || diagnosticSeed.status === "loading")
      ? "loading"
      : evidence.status;
  const panelError =
    viewMode === "diagnostics"
      ? (evidence.error ?? diagnosticSeed.error)
      : evidence.error;

  const handleRowClick = useCallback(
    (row: EpisodeLogConsoleRow) => {
      if (!timelineIndex) return;
      moveHorizon(row.timelineTimeNs, true);
      seek(timelineIndex.nsToSec(row.timelineTimeNs));
    },
    [moveHorizon, seek, timelineIndex],
  );

  const handleStreamsChange = useCallback(
    (streams: readonly string[]) => {
      setLogSettings(
        viewMode === "diagnostics"
          ? { enabledDiagnosticStreams: streams }
          : { enabledStreams: streams },
      );
    },
    [setLogSettings, viewMode],
  );

  const handleLevelsChange = useCallback(
    (levels: readonly LogLevel[]) => {
      setLogSettings({ selectedLevels: levels });
    },
    [setLogSettings],
  );

  const handleViewModeChange = useCallback(
    (nextViewMode: "diagnostics" | "logs") => {
      setLogSettings({ viewMode: nextViewMode });
    },
    [setLogSettings],
  );

  const timeOriginNs = timelineIndex?.startTimeNs;
  return (
    <LogConsole
      diagnosticSeedIncomplete={
        diagnosticStreams.length > 0 &&
        (horizon?.seedTimeNs !== undefined || diagnosticSeed.status === "error")
      }
      diagnostics={diagnostics}
      error={panelError}
      followPlayhead={followPlayhead}
      levels={LOG_LEVELS}
      onFollowPlayheadChange={(follow) =>
        setLogSettings({ followPlayhead: follow })
      }
      onLevelsChange={handleLevelsChange}
      onRowClick={handleRowClick}
      onStreamsChange={handleStreamsChange}
      onViewModeChange={handleViewModeChange}
      retentionTruncated={logRows.truncated}
      rows={logRows.rows}
      searchIncomplete={evidence.searchIncomplete}
      selectedLevels={selectedLevels}
      selectedStreams={selectedStreams}
      sources={sources}
      status={panelStatus}
      tailTimeNs={centerTimeNs}
      timeOriginNs={timeOriginNs}
      windowLabel={LOG_WINDOW_LABEL}
      windowStartNs={windowStartNs}
      viewMode={viewMode}
    />
  );
};

function nextLogHorizon(
  current: LogHorizon | undefined,
  playheadTimeNs: bigint,
  recordingStartNs: bigint,
  forceNewGeneration: boolean,
  scopeKey: string,
): LogHorizon {
  const visibleStartNs = logWindowStartNs(playheadTimeNs, LOG_WINDOW_BEFORE_NS);
  const continuous =
    !forceNewGeneration &&
    current !== undefined &&
    current.scopeKey === scopeKey &&
    playheadTimeNs >= current.playheadTimeNs &&
    visibleStartNs <= current.playheadTimeNs;
  if (continuous) {
    return { ...current, playheadTimeNs };
  }
  return {
    generation: (current?.generation ?? 0) + 1,
    playheadTimeNs,
    scopeKey,
    ...(visibleStartNs > recordingStartNs
      ? { seedTimeNs: visibleStartNs - 1n }
      : {}),
  };
}

function diagnosticCoverageState(
  evidence: LogEvidenceState,
  seed: DiagnosticSeedState,
): "complete" | "incomplete" | "pending" {
  if (
    evidence.searchIncomplete ||
    evidence.status === "error" ||
    seed.status === "error"
  ) {
    return "incomplete";
  }
  if (
    evidence.status === "idle" ||
    evidence.status === "loading" ||
    seed.status === "idle" ||
    seed.status === "loading"
  ) {
    return "pending";
  }
  return "complete";
}

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
