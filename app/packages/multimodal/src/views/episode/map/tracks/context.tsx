// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
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
import { isEpisodeReadCancelledError } from "../../../../ports";
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import { useDataStream } from "../../playback/data-stream-context";
import { useOptionalPlayhead } from "../../playback/use-optional-playhead";
import { FULL_HISTORY_RETENTION_MS } from "../../playback/use-demand-driven-history";
import {
  decimateLocationTrackSegments,
  isValidLocationPoint,
  locationPointFromVisualization,
  locationTrackColor,
  segmentLocationTrack,
  type LocationTrackPoint,
  type LocationTrackSegment,
  type LocationTracks,
  type LocationTrackState,
} from "./location-track";

const LOCATION_TRACK_READ_LIMIT = 25_000;
const LOCATION_TRACK_CACHE_MESSAGE_LIMIT = 250_000;
const LOCATION_TRACK_SELECTION_CACHE_LIMIT = 4;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;
const LOCATION_TRACK_PROGRESS_MESSAGE_INTERVAL = 250;
const LOCATION_TRACK_GRANT_BUDGET = {
  maxMessages: 5_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 750,
} as const;

const EMPTY_LOCATION_TRACKS: LocationTracks = new Map();

interface BoundedLocationTrackProgress {
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
  readonly pointsByStream: Map<string, LocationTrackPoint[]>;
  readonly streams: readonly string[];
  continuation?: ReadContinuation;
  coveredThroughNs?: bigint;
  error: boolean;
  evictionTimer?: ReturnType<typeof setTimeout>;
  hasRead: boolean;
  lastUsed: number;
  lastProgressPublishedMessageCount: number;
  messageCount: number;
  publicationKey?: string;
  publishedTracks?: LocationTracks;
  renderRevision: number;
  readonly renderedByStream: Map<
    string,
    {
      readonly segments: readonly LocationTrackSegment[];
      readonly truncated: boolean;
    }
  >;
  resumeAtNs?: bigint;
  retryTimer?: ReturnType<typeof setTimeout>;
  settledThroughNs?: bigint;
  targetHorizonNs?: bigint;
  terminal: boolean;
  truncated: boolean;
  readonly validPointCountPrefixByStream: Map<string, number[]>;
}

interface LocationTrackCacheEpoch {
  demandedKey: string | null;
  disposed: boolean;
  lastUsed: number;
  publishedKey: string | null;
  readonly selections: Map<string, BoundedLocationTrackProgress>;
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
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
  locationSources,
  session,
  sourceKey,
  streams,
}: {
  readonly budgetAccount?: SourceReadBudgetAccount | null;
  readonly locationSources: readonly SceneSource[];
  readonly session: EpisodeSession | null;
  readonly sourceKey: string | null;
  readonly streams?: readonly string[];
}) {
  const { setTracks } = useContextValue();
  const playbackStore = useContext(PlaybackStoreContext);
  const dataStream = useDataStream();
  const requestedStreams =
    streams ?? locationSources.map((locationSource) => locationSource.id);
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
      selections: new Map(),
      session,
      sourceKey,
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
        key: requestedStreamsKey,
        locationSources,
        streams,
      });
      epoch.selections.set(requestedStreamsKey, progress);
    }
    progress.lastUsed = ++epoch.lastUsed;
    pruneSelectionCache(epoch);
    if (progress.evictionTimer !== undefined) {
      clearTimeout(progress.evictionTimer);
      progress.evictionTimer = undefined;
    }
    if (progress.retryTimer !== undefined) {
      clearTimeout(progress.retryTimer);
      progress.retryTimer = undefined;
    }

    if (epoch.demandedKey !== requestedStreamsKey) {
      const previous =
        epoch.demandedKey === null
          ? undefined
          : epoch.selections.get(epoch.demandedKey);
      if (previous) {
        previous.active?.controller.abort();
        if (previous.error) {
          cancelProgress(previous);
          epoch.selections.delete(previous.key);
          if (epoch.publishedKey === previous.key) epoch.publishedKey = null;
        } else {
          scheduleProgressEviction(epoch, previous, setTracks);
        }
      }
      epoch.demandedKey = requestedStreamsKey;
    }
    const selectedProgress = progress;

    if (horizonNs === undefined) {
      publishProgress(epoch, selectedProgress, undefined, setTracks);
      return;
    }
    selectedProgress.targetHorizonNs = horizonNs;
    publishProgress(epoch, selectedProgress, horizonNs, setTracks);
    if (
      !progressNeedsRead(selectedProgress, horizonNs) ||
      selectedProgress.active
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
    const pump = selectedProgress.job
      ? pumpBoundedProgress({
          epoch,
          progress: selectedProgress,
          publish: () =>
            publishProgress(
              epoch,
              selectedProgress,
              selectedProgress.targetHorizonNs,
              setTracks,
            ),
          shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
          signal: controller.signal,
        })
      : pumpFallbackProgress({
          epoch,
          progress: selectedProgress,
          publish: () =>
            publishProgress(
              epoch,
              selectedProgress,
              selectedProgress.targetHorizonNs,
              setTracks,
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
        publishProgress(
          epoch,
          selectedProgress,
          selectedProgress.targetHorizonNs,
          setTracks,
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
    locationSources,
    playbackStore,
    pumpNonce,
    requestedStreamsKey,
    session,
    setTracks,
    sourceKey,
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
  key,
  locationSources,
  streams,
}: {
  readonly budgetAccount: SourceReadBudgetAccount | null | undefined;
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
  }
  return {
    active: undefined,
    baseByStream,
    error: false,
    hasRead: false,
    ...(budgetAccount ? { job: budgetAccount.createJob() } : {}),
    key,
    lastUsed: 0,
    lastProgressPublishedMessageCount: 0,
    messageCount: 0,
    pointsByStream: new Map(
      streams.map((stream) => [stream, [] as LocationTrackPoint[]]),
    ),
    renderRevision: 0,
    renderedByStream: new Map(),
    streams,
    terminal: false,
    truncated: false,
    validPointCountPrefixByStream: new Map(
      streams.map((stream) => [stream, [] as number[]]),
    ),
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
  readonly publish: () => void;
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
    const result: BudgetedReadResult = await job.read({
      admissionEndNs: horizonNs,
      budget: LOCATION_TRACK_GRANT_BUDGET,
      ...(progress.continuation ? { continuation: progress.continuation } : {}),
      signal,
      streams: progress.streams,
      window: timeRange,
    });
    if (epoch.disposed) return;
    consumeBatches(progress, result.batches);
    refreshRenderedSegments(progress);
    progress.hasRead = true;
    progress.continuation = result.continuation;
    progress.resumeAtNs = result.resumeAtNs;
    const madeProgress =
      result.batches.length > 0 || result.usage.chunksOpened > 0;

    if (progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT) {
      progress.terminal = true;
      progress.truncated = true;
      publish();
      return;
    }
    if (result.stopReason === "horizon-reached") {
      progress.settledThroughNs = maxBigInt(
        progress.settledThroughNs,
        horizonNs,
      );
      publish();
      return;
    }
    if (result.stopReason === "source-exhausted") {
      progress.terminal = true;
      progress.settledThroughNs = timeRange.endNs;
      publish();
      return;
    }
    if (
      result.stopReason === "oversized-source-unit" ||
      !madeProgress ||
      !progress.continuation ||
      progress.messageCount >= LOCATION_TRACK_CACHE_MESSAGE_LIMIT
    ) {
      progress.terminal = true;
      progress.truncated = true;
      publish();
      return;
    }
    publish();
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
  readonly publish: () => void;
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
    publish();
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
    publish();
    return;
  }
  const initial = {
    hasRead: progress.hasRead,
    lastProgressPublishedMessageCount:
      progress.lastProgressPublishedMessageCount,
    messageCount: progress.messageCount,
    pointLengths: new Map(
      [...progress.pointsByStream].map(([stream, points]) => [
        stream,
        points.length,
      ]),
    ),
    truncated: progress.truncated,
  };
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
      consumeBatches(progress, [batch]);
      progress.hasRead = true;
      if (
        progress.lastProgressPublishedMessageCount === 0 ||
        progress.messageCount - progress.lastProgressPublishedMessageCount >=
          LOCATION_TRACK_PROGRESS_MESSAGE_INTERVAL
      ) {
        progress.lastProgressPublishedMessageCount = progress.messageCount;
        refreshRenderedSegments(progress);
        publish();
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
    }
    refreshRenderedSegments(progress);
    publish();
    completed = true;
  } finally {
    if (!completed) {
      rollbackFallbackProgress(progress, initial);
      if (!epoch.disposed) publish();
    }
  }
}

function rollbackFallbackProgress(
  progress: BoundedLocationTrackProgress,
  initial: {
    readonly hasRead: boolean;
    readonly lastProgressPublishedMessageCount: number;
    readonly messageCount: number;
    readonly pointLengths: ReadonlyMap<string, number>;
    readonly truncated: boolean;
  },
): void {
  progress.hasRead = initial.hasRead;
  progress.lastProgressPublishedMessageCount =
    initial.lastProgressPublishedMessageCount;
  progress.messageCount = initial.messageCount;
  progress.truncated = initial.truncated;
  for (const [stream, length] of initial.pointLengths) {
    progress.pointsByStream.get(stream)?.splice(length);
    progress.validPointCountPrefixByStream.get(stream)?.splice(length);
  }
  refreshRenderedSegments(progress);
}

function consumeBatches(
  progress: BoundedLocationTrackProgress,
  batches: readonly FrameBatch[],
): void {
  for (const batch of batches) {
    const points = progress.pointsByStream.get(batch.stream);
    const validPointCountPrefix = progress.validPointCountPrefixByStream.get(
      batch.stream,
    );
    if (!points || !validPointCountPrefix) continue;
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
      points.push(point);
      validPointCountPrefix.push(
        (validPointCountPrefix.at(-1) ?? 0) +
          (isValidLocationPoint(point) ? 1 : 0),
      );
    }
  }
}

function refreshRenderedSegments(progress: BoundedLocationTrackProgress): void {
  for (const stream of progress.streams) {
    const rendered = decimateLocationTrackSegments(
      segmentLocationTrack(progress.pointsByStream.get(stream) ?? []),
    );
    progress.renderedByStream.set(stream, {
      segments: rendered.segments,
      truncated: rendered.truncated,
    });
  }
  progress.renderRevision += 1;
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
  const visibleCounts = progress.streams.map((stream) =>
    horizonNs === undefined
      ? 0
      : upperBoundLocationTime(
          progress.pointsByStream.get(stream) ?? [],
          horizonNs,
        ),
  );
  const publicationKey = [
    status,
    progress.truncated ? "truncated" : "full",
    progress.renderRevision,
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
    if (!base) return;
    const visibleCount = visibleCounts[index] ?? 0;
    const validPointCountPrefix =
      progress.validPointCountPrefixByStream.get(stream) ?? [];
    const rendered = progress.renderedByStream.get(stream);
    const visibleSegments =
      horizonNs === undefined || !rendered
        ? []
        : locationSegmentsThrough(rendered.segments, horizonNs);
    tracks.set(stream, {
      ...base,
      pointCount:
        visibleCount === 0 ? 0 : (validPointCountPrefix[visibleCount - 1] ?? 0),
      segments: visibleSegments,
      status,
      ...(progress.truncated || rendered?.truncated ? { truncated: true } : {}),
    });
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
        : { points: segment.points.slice(0, count) },
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
