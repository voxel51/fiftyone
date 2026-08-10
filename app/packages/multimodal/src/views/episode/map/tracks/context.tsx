// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext, useIsPlaying } from "@fiftyone/playback/runtime";
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type {
  BudgetedReadJob,
  BudgetedReadResult,
  EpisodeSession,
  FrameBatch,
  ReadContinuation,
  SourceReadBudgetAccount,
} from "../../../../ports";
import {
  BYTE_SOURCE_READ_PROFILE,
  type LocationVisualization,
  type ByteSourceReadProfile,
} from "../../../../ir";
import { isEpisodeReadCancelledError } from "../../../../ports";
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { markEpisodeLatencyEvent } from "../../../../observability/episode-latency";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import { useDataStream } from "../../playback/data-stream-context";
import {
  useStreamContentFrames,
  type StreamContentFrame,
} from "../../playback/use-stream-values";
import { useOptionalPlayhead } from "../../playback/use-optional-playhead";
import { FULL_HISTORY_RETENTION_MS } from "../../playback/use-demand-driven-history";
import {
  locationPointFromVisualization,
  locationTrackSegmentPrefix,
  locationTrackColor,
  type LocationTrackPoint,
  type LocationTrackSegment,
  type LocationTracks,
  type LocationTrackState,
} from "./location-track";
import {
  SharedLocationPointStore,
  type LocationPointStoreAddResult,
  type SharedLocationPointTransaction,
} from "./shared-location-point-store";

const LOCATION_TRACK_READ_LIMIT = 25_000;
const LOCATION_TRACK_CACHE_MESSAGE_LIMIT = 250_000;
const LOCATION_TRACK_SELECTION_CACHE_LIMIT = 4;
const LOCATION_TRACK_RETAINED_POINT_LIMIT = 250_000;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;
const LOCATION_TRACK_PROGRESS_MESSAGE_INTERVAL = 250;
const LOCATION_TRACK_PUBLICATION_INTERVAL_MS = 100;
const LOCATION_TRACK_GRANT_BUDGET = {
  maxMessages: 5_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 750,
} as const;

const EMPTY_LOCATION_TRACKS: LocationTracks = new Map();

interface BoundedLocationTrackProgress {
  readonly fallbackAfterAccountExhaustion: boolean;
  active:
    | {
        readonly controller: AbortController;
      }
    | undefined;
  readonly baseByStream: ReadonlyMap<
    string,
    Omit<LocationTrackState, "pointCount" | "segments" | "status">
  >;
  readonly job?: BudgetedReadJob;
  readonly key: string;
  readonly streams: readonly string[];
  completedEvent: boolean;
  continuation?: ReadContinuation;
  coveredThroughNs?: bigint;
  downsampledEvent: boolean;
  error: boolean;
  evictionTimer?: ReturnType<typeof setTimeout>;
  hasRead: boolean;
  lastUsed: number;
  lastProgressPublishedMessageCount: number;
  lastPublicationAtMs: number;
  publishedStatus?: LocationTrackState["status"];
  publicationTimer?: ReturnType<typeof setTimeout>;
  messageCount: number;
  publicationKey?: string;
  publishedTracks?: LocationTracks;
  resumeAtNs?: bigint;
  retryTimer?: ReturnType<typeof setTimeout>;
  settledThroughNs?: bigint;
  skipOversizedSourceUnit: boolean;
  startedEvent: boolean;
  targetHorizonNs?: bigint;
  terminal: boolean;
  truncated: boolean;
  useFallbackRead: boolean;
}

interface LocationTrackCacheEpoch {
  demandedKey: string | null;
  disposed: boolean;
  lastUsed: number;
  publishedKey: string | null;
  retainedPointCount: number;
  readonly selections: Map<string, BoundedLocationTrackProgress>;
  readonly session: EpisodeSession | null;
  readonly setTracks: LocationTracksContextValue["setTracks"];
  readonly sourceKey: string | null;
  readonly storesByStream: Map<string, SharedLocationPointStore>;
  readonly timeRange: EpisodeSession["manifest"]["timeRange"] | null;
}

interface LocationTracksContextValue {
  readonly setTracks: (
    sourceKey: string | null,
    tracks: LocationTracks,
  ) => void;
  readonly sourceKey: string | null;
  readonly tracks: LocationTracks;
}

const LocationTracksContext = createContext<LocationTracksContextValue | null>(
  null,
);

/**
 * Shares playhead-admitted geographic tracks with map tiles. The provider
 * lives outside playback so a closed and promptly reopened map can reuse the
 * same source/session/stream-selection cache.
 */
export const LocationTracksProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [state, setState] = useState<{
    readonly sourceKey: string | null;
    readonly tracks: LocationTracks;
  }>({ sourceKey: null, tracks: EMPTY_LOCATION_TRACKS });
  const setTracks = React.useCallback(
    (sourceKey: string | null, tracks: LocationTracks) => {
      setState({ sourceKey, tracks });
    },
    [],
  );
  const value = useMemo(() => ({ ...state, setTracks }), [setTracks, state]);

  return (
    <LocationTracksContext.Provider value={value}>
      {children}
    </LocationTracksContext.Provider>
  );
};

/** Returns the location histories currently retained for the active source. */
export function useLocationTracksContext(): LocationTracks {
  return useContextValue().tracks;
}

/** Returns the source key associated with the published location tracks. */
export function useLocationTracksSourceKey(): string | null {
  return useContextValue().sourceKey;
}

/**
 * Loads selected location histories together on the bulk lane. A stable
 * full-manifest continuation advances only through atomic groups admitted by
 * the playhead, while publication hides any future points in a straddling
 * group.
 */
export function LocationTracksBridge({
  budgetAccount,
  liveFrames: liveFramesOverride,
  locationSources,
  session,
  sourceReadProfile,
  sourceKey,
  streams,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount | null;
  /** Test seam for already-admitted current frames. */
  readonly liveFrames?: readonly (StreamContentFrame<LocationVisualization> | null)[];
  readonly locationSources: readonly SceneSource[];
  readonly session: EpisodeSession | null;
  readonly sourceReadProfile?: ByteSourceReadProfile;
  readonly sourceKey: string | null;
  readonly streams?: readonly string[];
}) {
  const { setTracks } = useContextValue();
  const playbackStore = useContext(PlaybackStoreContext);
  const isPlaying = useIsPlaying();
  const dataStream = useDataStream();
  const requestedStreams = useMemo(
    () => streams ?? locationSources.map((locationSource) => locationSource.id),
    [locationSources, streams],
  );
  const subscribedLiveFrames =
    useStreamContentFrames<LocationVisualization>(requestedStreams);
  const liveFrames = liveFramesOverride ?? subscribedLiveFrames;
  const requestedStreamsKey = [...new Set(requestedStreams)].sort().join("\0");
  const playheadSec = useOptionalPlayhead(requestedStreamsKey.length > 0);
  const timeline = dataStream?.getTimelineIndex() ?? null;
  const unclampedHorizonNs = timeline?.secToNs(playheadSec);
  const manifestTimeRange = session?.manifest.timeRange ?? null;
  const horizonNs =
    unclampedHorizonNs !== undefined && manifestTimeRange
      ? unclampedHorizonNs > manifestTimeRange.endNs
        ? manifestTimeRange.endNs
        : unclampedHorizonNs
      : undefined;
  const locationSourcesKey = locationSources
    .map((source) => [source.id, source.label, source.sourceName].join("\0"))
    .join("\u0001");
  const cacheEpochRef = React.useRef<LocationTrackCacheEpoch | null>(null);
  const [pumpNonce, setPumpNonce] = useState(0);

  // A source/session swap is the hard cache and cancellation boundary.
  useLayoutEffect(() => {
    const epoch: LocationTrackCacheEpoch = {
      demandedKey: null,
      disposed: false,
      lastUsed: 0,
      publishedKey: null,
      retainedPointCount: 0,
      selections: new Map(),
      session,
      setTracks,
      sourceKey,
      storesByStream: new Map(),
      timeRange: manifestTimeRange,
    };
    cacheEpochRef.current = epoch;
    setTracks(sourceKey, EMPTY_LOCATION_TRACKS);
    return () => {
      epoch.disposed = true;
      for (const progress of epoch.selections.values()) {
        cancelProgress(progress);
      }
      if (cacheEpochRef.current === epoch) cacheEpochRef.current = null;
    };
  }, [
    budgetAccount,
    locationSourcesKey,
    manifestTimeRange,
    session,
    setTracks,
    sourceKey,
  ]);

  // Reconcile demand and the exact playhead against the retained selection.
  useEffect(() => {
    const epoch = cacheEpochRef.current;
    if (
      !epoch ||
      epoch.disposed ||
      epoch.session !== session ||
      epoch.sourceKey !== sourceKey ||
      !session ||
      !sourceKey
    ) {
      return;
    }

    if (!requestedStreamsKey) {
      const previous =
        epoch.demandedKey === null
          ? undefined
          : epoch.selections.get(epoch.demandedKey);
      epoch.demandedKey = null;
      if (previous) {
        previous.active?.controller.abort();
        cancelProgressPublication(previous);
        if (previous.error) {
          cancelProgress(previous);
          epoch.selections.delete(previous.key);
          if (epoch.publishedKey === previous.key) {
            epoch.publishedKey = null;
            setTracks(epoch.sourceKey, EMPTY_LOCATION_TRACKS);
          }
        } else {
          scheduleProgressEviction(epoch, previous, setTracks);
        }
      }
      return;
    }

    const streams = requestedStreamsKey.split("\0");
    let progress = epoch.selections.get(requestedStreamsKey);
    if (!progress) {
      progress = createProgress({
        budgetAccount,
        epoch,
        fallbackAfterAccountExhaustion:
          sourceReadProfile === BYTE_SOURCE_READ_PROFILE.LOCAL,
        key: requestedStreamsKey,
        locationSources,
        streams,
      });
      epoch.selections.set(requestedStreamsKey, progress);
    }
    progress.lastUsed = ++epoch.lastUsed;
    touchProgressStores(epoch, progress);
    pruneSelectionCache(epoch);
    if (progress.evictionTimer !== undefined) {
      clearTimeout(progress.evictionTimer);
      progress.evictionTimer = undefined;
    }
    if (epoch.demandedKey !== requestedStreamsKey) {
      const previous =
        epoch.demandedKey === null
          ? undefined
          : epoch.selections.get(epoch.demandedKey);
      if (previous) {
        previous.active?.controller.abort();
        cancelProgressPublication(previous);
        if (previous.error) {
          cancelProgress(previous);
          epoch.selections.delete(previous.key);
          if (epoch.publishedKey === previous.key) epoch.publishedKey = null;
        } else {
          scheduleProgressEviction(epoch, previous, setTracks);
        }
      }
      epoch.demandedKey = requestedStreamsKey;
      if (progress.retryTimer !== undefined) {
        clearTimeout(progress.retryTimer);
        progress.retryTimer = undefined;
      }
    }
    const selectedProgress = progress;

    if (horizonNs === undefined) {
      requestProgressPublication(
        epoch,
        selectedProgress,
        undefined,
        setTracks,
        true,
      );
      return;
    }
    const previousHorizonNs = selectedProgress.targetHorizonNs;
    selectedProgress.targetHorizonNs = horizonNs;
    requestProgressPublication(
      epoch,
      selectedProgress,
      horizonNs,
      setTracks,
      !isPlaying ||
        previousHorizonNs === undefined ||
        horizonNs < previousHorizonNs,
    );
    if (
      !progressNeedsRead(selectedProgress, horizonNs) ||
      selectedProgress.active ||
      selectedProgress.retryTimer !== undefined
    ) {
      return;
    }

    if (shouldDeferBulkHistory(playbackStore)) {
      if (selectedProgress.retryTimer === undefined) {
        selectedProgress.retryTimer = setTimeout(() => {
          selectedProgress.retryTimer = undefined;
          if (!epoch.disposed) setPumpNonce((value) => value + 1);
        }, LOCATION_TRACK_DEFERRED_RETRY_MS);
      }
      return;
    }

    const controller = new AbortController();
    const active = { controller } as const;
    selectedProgress.active = active;
    const pump =
      selectedProgress.job && !selectedProgress.useFallbackRead
        ? pumpBoundedProgress({
            epoch,
            progress: selectedProgress,
            publish: (immediate) =>
              requestProgressPublication(
                epoch,
                selectedProgress,
                selectedProgress.targetHorizonNs,
                setTracks,
                immediate,
              ),
            shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
            signal: controller.signal,
          })
        : pumpFallbackProgress({
            epoch,
            progress: selectedProgress,
            publish: (immediate) =>
              requestProgressPublication(
                epoch,
                selectedProgress,
                selectedProgress.targetHorizonNs,
                setTracks,
                immediate,
              ),
            shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
            signal: controller.signal,
          });
    void pump
      .catch((error: unknown) => {
        if (
          epoch.disposed ||
          controller.signal.aborted ||
          isEpisodeReadCancelledError(error)
        ) {
          return;
        }
        selectedProgress.error = true;
        requestProgressPublication(
          epoch,
          selectedProgress,
          selectedProgress.targetHorizonNs,
          setTracks,
          true,
        );
      })
      .finally(() => {
        if (selectedProgress.active === active) {
          selectedProgress.active = undefined;
        }
        if (!epoch.disposed && epoch.demandedKey === selectedProgress.key) {
          setPumpNonce((value) => value + 1);
        }
      });
  }, [
    budgetAccount,
    horizonNs,
    isPlaying,
    locationSources,
    playbackStore,
    pumpNonce,
    requestedStreamsKey,
    session,
    setTracks,
    sourceReadProfile,
    sourceKey,
  ]);

  // A bounded remote scan can exhaust its shared source account before the
  // playhead reaches the admitted route tail. Current frames are already paid
  // for by playback, so retain them in the same per-stream store. This grows a
  // truthful trail without bypassing the remote history budget; gaps and
  // backward seeks still use the same segment builder and horizon filter.
  useEffect(() => {
    const epoch = cacheEpochRef.current;
    const progress = epoch?.selections.get(requestedStreamsKey);
    if (
      !epoch ||
      epoch.disposed ||
      epoch.demandedKey !== requestedStreamsKey ||
      !progress ||
      horizonNs === undefined
    ) {
      return;
    }

    let changed = false;
    liveFrames.forEach((frame, index) => {
      const stream = requestedStreams[index];
      if (
        !frame ||
        !stream ||
        frame.contentTimeNs > horizonNs ||
        frame.contentTimeNs <
          (epoch.timeRange?.startNs ?? frame.contentTimeNs) ||
        frame.contentTimeNs > (epoch.timeRange?.endNs ?? frame.contentTimeNs) ||
        frame.frame.kind !== VISUALIZATION_KIND.LOCATION
      ) {
        return;
      }
      const point = locationPointFromVisualization(
        frame.frame,
        frame.contentTimeNs,
      );
      changed =
        retainLocationPoint(epoch, progress, stream, point) === "inserted" ||
        changed;
    });
    if (changed) {
      requestProgressPublication(
        epoch,
        progress,
        horizonNs,
        setTracks,
        !isPlaying,
      );
    }
  }, [
    horizonNs,
    isPlaying,
    liveFrames,
    requestedStreams,
    requestedStreamsKey,
    setTracks,
  ]);

  // The provider outlives source bridges, so explicitly clear on final unmount.
  useEffect(
    () => () => {
      setTracks(null, EMPTY_LOCATION_TRACKS);
    },
    [setTracks],
  );

  return null;
}

function createProgress({
  budgetAccount,
  epoch,
  fallbackAfterAccountExhaustion,
  key,
  locationSources,
  streams,
}: {
  readonly budgetAccount: SourceReadBudgetAccount | null | undefined;
  readonly epoch: LocationTrackCacheEpoch;
  readonly fallbackAfterAccountExhaustion: boolean;
  readonly key: string;
  readonly locationSources: readonly SceneSource[];
  readonly streams: readonly string[];
}): BoundedLocationTrackProgress {
  const baseByStream = new Map<
    string,
    Omit<LocationTrackState, "pointCount" | "segments" | "status">
  >();
  for (const stream of streams) {
    const index = locationSources.findIndex((source) => source.id === stream);
    const source = locationSources[index];
    if (!source || index < 0) continue;
    baseByStream.set(stream, {
      color: locationTrackColor(index),
      label: source.label,
      sourceName: source.sourceName,
      stream,
    });
    getOrCreatePointStore(epoch, stream);
  }
  return {
    active: undefined,
    baseByStream,
    completedEvent: false,
    downsampledEvent: false,
    error: false,
    fallbackAfterAccountExhaustion,
    hasRead: false,
    ...(budgetAccount ? { job: budgetAccount.createJob() } : {}),
    key,
    lastUsed: 0,
    lastProgressPublishedMessageCount: 0,
    lastPublicationAtMs: Number.NEGATIVE_INFINITY,
    messageCount: 0,
    startedEvent: false,
    skipOversizedSourceUnit: false,
    streams,
    terminal: false,
    truncated: false,
    useFallbackRead: false,
  };
}

async function pumpBoundedProgress({
  epoch,
  progress,
  publish,
  shouldStandDown,
  signal,
}: {
  readonly epoch: LocationTrackCacheEpoch;
  readonly progress: BoundedLocationTrackProgress;
  readonly publish: (immediate?: boolean) => void;
  readonly shouldStandDown: () => boolean;
  readonly signal: AbortSignal;
}): Promise<void> {
  const job = progress.job;
  const session = epoch.session;
  const timeRange = epoch.timeRange;
  if (!job || !session || !timeRange) return;

  while (!signal.aborted && !epoch.disposed && !progress.terminal) {
    const horizonNs = progress.targetHorizonNs;
    if (horizonNs === undefined || !progressNeedsRead(progress, horizonNs)) {
      return;
    }
    if (shouldStandDown()) return;
    markLocationReadStarted(progress);
    const skipOversizedSourceUnit = progress.skipOversizedSourceUnit;
    const result: BudgetedReadResult = await job.read({
      admissionEndNs: horizonNs,
      budget: LOCATION_TRACK_GRANT_BUDGET,
      ...(progress.continuation ? { continuation: progress.continuation } : {}),
      ...(skipOversizedSourceUnit ? { skipOversizedSourceUnit: true } : {}),
      signal,
      streams: progress.streams,
      window: timeRange,
    });
    if (signal.aborted || epoch.disposed) return;
    progress.skipOversizedSourceUnit = false;
    consumeBatches(epoch, progress, result.batches);
    progress.hasRead = true;
    progress.continuation = result.continuation;
    progress.resumeAtNs = result.resumeAtNs;
    const madeProgress =
      result.batches.length > 0 || result.usage.chunksOpened > 0;
    const firstProgressPublication =
      progress.lastProgressPublishedMessageCount === 0 &&
      progress.messageCount > 0;
    if (firstProgressPublication) {
      progress.lastProgressPublishedMessageCount = progress.messageCount;
    }
    if ((result.unavailableByStream?.size ?? 0) > 0) {
      progress.truncated = true;
    }

    if (progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT) {
      progress.terminal = true;
      progress.truncated = true;
      markLocationReadCompleted(progress);
      publish(true);
      return;
    }
    if (result.stopReason === "horizon-reached") {
      progress.settledThroughNs = maxBigInt(
        progress.settledThroughNs,
        horizonNs,
      );
      publish(true);
      return;
    }
    if (result.stopReason === "source-exhausted") {
      progress.terminal = true;
      progress.settledThroughNs = timeRange.endNs;
      markLocationReadCompleted(progress);
      publish(true);
      return;
    }
    if (result.stopReason === "account-exhausted") {
      if (progress.fallbackAfterAccountExhaustion) {
        progress.continuation = undefined;
        progress.resumeAtNs = undefined;
        progress.useFallbackRead = true;
        return;
      }
      progress.terminal = true;
      progress.truncated = true;
      markLocationReadCompleted(progress);
      publish(true);
      return;
    }
    if (result.stopReason === "oversized-source-unit") {
      progress.truncated = true;
      if (progress.continuation) {
        publish(firstProgressPublication);
        continue;
      }
      progress.terminal = true;
      markLocationReadCompleted(progress);
      publish(true);
      return;
    }
    if (
      result.stopReason === "budget-exhausted" &&
      !madeProgress &&
      progress.continuation &&
      !skipOversizedSourceUnit
    ) {
      progress.skipOversizedSourceUnit = true;
      publish();
      continue;
    }
    if (
      !madeProgress ||
      !progress.continuation ||
      progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT
    ) {
      progress.terminal = true;
      progress.truncated = true;
      markLocationReadCompleted(progress);
      publish(true);
      return;
    }
    publish(firstProgressPublication);
  }
}

async function pumpFallbackProgress({
  epoch,
  progress,
  publish,
  shouldStandDown,
  signal,
}: {
  readonly epoch: LocationTrackCacheEpoch;
  readonly progress: BoundedLocationTrackProgress;
  readonly publish: (immediate?: boolean) => void;
  readonly shouldStandDown: () => boolean;
  readonly signal: AbortSignal;
}): Promise<void> {
  const session = epoch.session;
  const timeRange = epoch.timeRange;
  const horizonNs = progress.targetHorizonNs;
  if (!session || !timeRange || horizonNs === undefined || shouldStandDown()) {
    return;
  }
  const startNs =
    progress.coveredThroughNs === undefined
      ? timeRange.startNs
      : progress.coveredThroughNs + 1n;
  if (horizonNs < startNs) {
    progress.hasRead = true;
    progress.settledThroughNs = maxBigInt(progress.settledThroughNs, horizonNs);
    publish(true);
    return;
  }

  const remaining = Math.max(
    0,
    LOCATION_TRACK_CACHE_MESSAGE_LIMIT - progress.messageCount,
  );
  const limit = Math.min(LOCATION_TRACK_READ_LIMIT, remaining);
  if (limit === 0) {
    progress.terminal = true;
    progress.truncated = true;
    markLocationReadCompleted(progress);
    publish(true);
    return;
  }
  const initial = {
    hasRead: progress.hasRead,
    lastProgressPublishedMessageCount:
      progress.lastProgressPublishedMessageCount,
    messageCount: progress.messageCount,
    truncated: progress.truncated,
  };
  const transactionsByStream = new Map(
    progress.streams.map((stream) => [
      stream,
      getOrCreatePointStore(epoch, stream).beginTransaction(),
    ]),
  );
  let completed = false;
  try {
    let readMessages = 0;
    for await (const batch of session.read({
      limit,
      priority: "bulk",
      signal,
      streams: progress.streams,
      window: { endNs: horizonNs, startNs },
    })) {
      if (signal.aborted || epoch.disposed) return;
      readMessages += batch.frames.length;
      consumeBatches(epoch, progress, [batch], transactionsByStream);
      progress.hasRead = true;
      if (
        progress.lastProgressPublishedMessageCount === 0 ||
        progress.messageCount - progress.lastProgressPublishedMessageCount >=
          LOCATION_TRACK_PROGRESS_MESSAGE_INTERVAL
      ) {
        const firstProgressPublication =
          progress.lastProgressPublishedMessageCount === 0;
        progress.lastProgressPublishedMessageCount = progress.messageCount;
        publish(firstProgressPublication);
      }
      if (progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT) break;
    }
    if (signal.aborted || epoch.disposed) return;
    progress.hasRead = true;
    progress.coveredThroughNs = horizonNs;
    progress.settledThroughNs = maxBigInt(progress.settledThroughNs, horizonNs);
    if (readMessages >= limit) {
      progress.terminal = true;
      progress.truncated = true;
      markLocationReadCompleted(progress);
    }
    for (const transaction of transactionsByStream.values()) {
      transaction.commit();
    }
    publish(true);
    completed = true;
  } finally {
    if (!completed) {
      rollbackFallbackProgress(epoch, progress, initial, transactionsByStream);
      if (!epoch.disposed) publish(true);
    }
  }
}

function rollbackFallbackProgress(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  initial: {
    readonly hasRead: boolean;
    readonly lastProgressPublishedMessageCount: number;
    readonly messageCount: number;
    readonly truncated: boolean;
  },
  transactionsByStream: ReadonlyMap<string, SharedLocationPointTransaction>,
): void {
  progress.hasRead = initial.hasRead;
  progress.lastProgressPublishedMessageCount =
    initial.lastProgressPublishedMessageCount;
  progress.messageCount = initial.messageCount;
  progress.truncated = initial.truncated;
  for (const transaction of transactionsByStream.values()) {
    epoch.retainedPointCount -= transaction.rollback();
  }
}

function consumeBatches(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  batches: readonly FrameBatch[],
  transactionsByStream?: ReadonlyMap<string, SharedLocationPointTransaction>,
): void {
  for (const batch of batches) {
    const store = epoch.storesByStream.get(batch.stream);
    if (!store) {
      progress.truncated = true;
      progress.messageCount = Math.min(
        LOCATION_TRACK_CACHE_MESSAGE_LIMIT,
        progress.messageCount + batch.frames.length,
      );
      if (progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT) return;
      continue;
    }
    store.lastUsed = ++epoch.lastUsed;
    for (const frame of batch.frames) {
      if (progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT) {
        progress.truncated = true;
        return;
      }
      progress.messageCount += 1;
      const visualization = frame.output.visualization;
      if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) continue;
      const point = locationPointFromVisualization(
        visualization,
        frame.timestampNs,
      );
      retainLocationPoint(
        epoch,
        progress,
        batch.stream,
        point,
        transactionsByStream?.get(batch.stream),
      );
    }
  }
}

function progressNeedsRead(
  progress: BoundedLocationTrackProgress,
  horizonNs: bigint,
): boolean {
  if (progress.error || progress.terminal) return false;
  if (
    progress.settledThroughNs !== undefined &&
    horizonNs <= progress.settledThroughNs
  ) {
    return false;
  }
  if (progress.resumeAtNs !== undefined && horizonNs < progress.resumeAtNs) {
    return false;
  }
  if (
    progress.coveredThroughNs !== undefined &&
    horizonNs <= progress.coveredThroughNs
  ) {
    return false;
  }
  return true;
}

function requestProgressPublication(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  horizonNs: bigint | undefined,
  setTracks: LocationTracksContextValue["setTracks"],
  immediate = false,
): void {
  if (
    epoch.disposed ||
    epoch.demandedKey !== progress.key ||
    !epoch.sourceKey
  ) {
    return;
  }
  const publicationHorizonNs = immediate ? horizonNs : progress.targetHorizonNs;
  const status = progressStatus(progress, publicationHorizonNs);
  if (
    immediate ||
    !progress.publishedTracks ||
    progress.publishedStatus !== status
  ) {
    cancelProgressPublication(progress);
    publishProgress(epoch, progress, horizonNs, setTracks);
    return;
  }
  if (progress.publicationTimer !== undefined) return;
  const elapsedMs = Date.now() - progress.lastPublicationAtMs;
  const delayMs = Math.max(
    0,
    LOCATION_TRACK_PUBLICATION_INTERVAL_MS - elapsedMs,
  );
  progress.publicationTimer = setTimeout(() => {
    progress.publicationTimer = undefined;
    publishProgress(epoch, progress, progress.targetHorizonNs, setTracks);
  }, delayMs);
}

function cancelProgressPublication(
  progress: BoundedLocationTrackProgress,
): void {
  if (progress.publicationTimer === undefined) return;
  clearTimeout(progress.publicationTimer);
  progress.publicationTimer = undefined;
}

function publishProgress(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  horizonNs: bigint | undefined,
  setTracks: LocationTracksContextValue["setTracks"],
): void {
  if (
    epoch.disposed ||
    epoch.demandedKey !== progress.key ||
    !epoch.sourceKey
  ) {
    return;
  }
  const status = progressStatus(progress, horizonNs);
  progress.lastPublicationAtMs = Date.now();
  progress.publishedStatus = status;
  const visibleCounts = progress.streams.map((stream) =>
    horizonNs === undefined
      ? 0
      : (epoch.storesByStream.get(stream)?.countThrough(horizonNs) ?? 0),
  );
  const renderRevisions = progress.streams.map(
    (stream) =>
      epoch.storesByStream.get(stream)?.renderRevision ?? "missing-store",
  );
  const publicationKey = [
    status,
    progress.truncated ? "truncated" : "full",
    ...renderRevisions,
    ...visibleCounts,
  ].join(":");
  if (progress.publicationKey === publicationKey && progress.publishedTracks) {
    if (epoch.publishedKey !== progress.key) {
      epoch.publishedKey = progress.key;
      setTracks(epoch.sourceKey, progress.publishedTracks);
    }
    return;
  }

  const tracks = new Map<string, LocationTrackState>();
  progress.streams.forEach((stream, index) => {
    const base = progress.baseByStream.get(stream);
    const store = epoch.storesByStream.get(stream);
    if (!base) return;
    if (!store) {
      tracks.set(stream, {
        ...base,
        pointCount: 0,
        segments: [],
        status,
        truncated: true,
      });
      return;
    }
    const visibleCount = visibleCounts[index] ?? 0;
    const rendered = store.renderedTrack();
    const visibleSegments =
      horizonNs === undefined
        ? []
        : locationSegmentsThrough(rendered.segments, horizonNs);
    tracks.set(stream, {
      ...base,
      ...(rendered.truncated ? { downsampled: true } : {}),
      pointCount: store.validPointCountAt(visibleCount),
      segments: visibleSegments,
      status,
      ...(progress.truncated || store.truncated ? { truncated: true } : {}),
    });
    if (rendered.truncated && !progress.downsampledEvent) {
      progress.downsampledEvent = true;
      markEpisodeLatencyEvent("location track downsampled", {
        points: store.validPointCountAt(store.pointCount),
      });
    }
  });
  progress.publicationKey = publicationKey;
  progress.publishedTracks = tracks;
  epoch.publishedKey = progress.key;
  setTracks(epoch.sourceKey, tracks);
}

function locationSegmentsThrough(
  segments: readonly LocationTrackSegment[],
  horizonNs: bigint,
): readonly LocationTrackSegment[] {
  const visible: LocationTrackSegment[] = [];
  for (const segment of segments) {
    const count = upperBoundLocationTime(segment.points, horizonNs);
    if (count === 0) continue;
    visible.push(
      count === segment.points.length
        ? segment
        : locationTrackSegmentPrefix(segment, count),
    );
  }
  return visible;
}

function progressStatus(
  progress: BoundedLocationTrackProgress,
  horizonNs: bigint | undefined,
): LocationTrackState["status"] {
  if (progress.error) return "error";
  if (progress.terminal) return "ready";
  if (horizonNs === undefined || !progress.hasRead) return "loading";
  return progressNeedsRead(progress, horizonNs) ? "loading" : "ready";
}

function upperBoundLocationTime(
  points: readonly LocationTrackPoint[],
  horizonNs: bigint,
): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle].timeNs <= horizonNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function scheduleProgressEviction(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  setTracks: LocationTracksContextValue["setTracks"],
): void {
  if (progress.evictionTimer !== undefined) {
    clearTimeout(progress.evictionTimer);
  }
  progress.evictionTimer = setTimeout(() => {
    progress.evictionTimer = undefined;
    if (epoch.disposed || epoch.demandedKey === progress.key) return;
    cancelProgress(progress);
    epoch.selections.delete(progress.key);
    if (epoch.publishedKey === progress.key) {
      epoch.publishedKey = null;
      setTracks(epoch.sourceKey, EMPTY_LOCATION_TRACKS);
    }
  }, FULL_HISTORY_RETENTION_MS);
}

function pruneSelectionCache(epoch: LocationTrackCacheEpoch): void {
  while (epoch.selections.size > LOCATION_TRACK_SELECTION_CACHE_LIMIT) {
    const candidate = [...epoch.selections.values()]
      .filter((progress) => progress.key !== epoch.demandedKey)
      .sort((left, right) => left.lastUsed - right.lastUsed)[0];
    if (!candidate) return;
    cancelProgress(candidate);
    epoch.selections.delete(candidate.key);
  }
}

function getOrCreatePointStore(
  epoch: LocationTrackCacheEpoch,
  stream: string,
): SharedLocationPointStore {
  let store = epoch.storesByStream.get(stream);
  if (!store) {
    store = new SharedLocationPointStore();
    epoch.storesByStream.set(stream, store);
  }
  return store;
}

function touchProgressStores(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
): void {
  for (const stream of progress.streams) {
    getOrCreatePointStore(epoch, stream).lastUsed = ++epoch.lastUsed;
  }
}

function retainLocationPoint(
  epoch: LocationTrackCacheEpoch,
  progress: BoundedLocationTrackProgress,
  stream: string,
  point: LocationTrackPoint,
  transaction?: SharedLocationPointTransaction,
): LocationPointStoreAddResult {
  const store = getOrCreatePointStore(epoch, stream);
  store.lastUsed = ++epoch.lastUsed;
  const duplicate = store.hasPoint(point);
  if (!duplicate) makeRetainedPointCapacity(epoch);
  const retain =
    duplicate || epoch.retainedPointCount < LOCATION_TRACK_RETAINED_POINT_LIMIT;
  const result = transaction
    ? transaction.add(point, retain)
    : store.addCommitted(point, retain);
  if (result === "inserted") epoch.retainedPointCount += 1;
  if (result === "rejected-cap") progress.truncated = true;
  return result;
}

function makeRetainedPointCapacity(epoch: LocationTrackCacheEpoch): void {
  const demandedStreams = new Set(
    epoch.demandedKey ? epoch.demandedKey.split("\0") : [],
  );
  while (epoch.retainedPointCount >= LOCATION_TRACK_RETAINED_POINT_LIMIT) {
    const candidate = [...epoch.storesByStream.entries()]
      .filter(
        ([stream, store]) =>
          !demandedStreams.has(stream) && !store.hasActiveTransactions,
      )
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed)[0];
    if (!candidate) return;
    evictPointStore(epoch, candidate[0], candidate[1]);
  }
}

function evictPointStore(
  epoch: LocationTrackCacheEpoch,
  stream: string,
  store: SharedLocationPointStore,
): void {
  epoch.storesByStream.delete(stream);
  epoch.retainedPointCount -= store.pointCount;
  for (const progress of [...epoch.selections.values()]) {
    if (
      progress.key === epoch.demandedKey ||
      !progress.streams.includes(stream)
    ) {
      continue;
    }
    cancelProgress(progress);
    epoch.selections.delete(progress.key);
    if (epoch.publishedKey === progress.key) {
      epoch.publishedKey = null;
      epoch.setTracks(epoch.sourceKey, EMPTY_LOCATION_TRACKS);
    }
  }
}

function cancelProgress(progress: BoundedLocationTrackProgress): void {
  progress.active?.controller.abort();
  progress.active = undefined;
  if (progress.evictionTimer !== undefined) {
    clearTimeout(progress.evictionTimer);
    progress.evictionTimer = undefined;
  }
  if (progress.retryTimer !== undefined) {
    clearTimeout(progress.retryTimer);
    progress.retryTimer = undefined;
  }
  cancelProgressPublication(progress);
}

function maxBigInt(current: bigint | undefined, candidate: bigint): bigint {
  return current === undefined || candidate > current ? candidate : current;
}

function useContextValue(): LocationTracksContextValue {
  const value = useContext(LocationTracksContext);
  if (!value) {
    throw new Error(
      "episode location tracks must be used inside <LocationTracksProvider>",
    );
  }

  return value;
}
