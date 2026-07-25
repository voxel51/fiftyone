// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest, and this
// bridge mirrors the pose-trajectory bulk fetch path.
import { PlaybackStoreContext } from "@fiftyone/playback/runtime";
import React, {
  useCallback,
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
import type { SceneSource } from "../../../../scene-inventory";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { shouldDeferBulkHistory } from "../../playback/bulk-stream-lifecycle";
import {
  useDemandDrivenHistory,
  type DemandDrivenHistoryLoader,
} from "../../playback/use-demand-driven-history";
import {
  decimateLocationTrackSegments,
  locationPointFromVisualization,
  locationTrackColor,
  segmentLocationTrack,
  type LocationTrackPoint,
  type LocationTracks,
  type LocationTrackState,
} from "./location-track";

const LOCATION_TRACK_READ_LIMIT = 25_000;
const LOCATION_TRACK_DEFERRED_RETRY_MS = 2_000;
const LOCATION_TRACK_PROGRESS_POINT_INTERVAL = 250;
const LOCATION_TRACK_GRANT_BUDGET = {
  maxMessages: 5_000,
  maxSourceBytes: 32 * 1024 * 1024,
  maxUncompressedBytes: 64 * 1024 * 1024,
  maxWallTimeMs: 750,
} as const;

const EMPTY_LOCATION_TRACKS: LocationTracks = new Map();

interface BoundedLocationTrackProgress {
  readonly job: BudgetedReadJob;
  readonly points: LocationTrackPoint[];
  continuation?: ReadContinuation;
  messageCount: number;
  publishedPointCount: number;
  truncated: boolean;
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
 * Shares full-file geographic tracks with map tiles. The provider lives
 * outside playback; the bridge inside playback performs one bulk read per
 * source file and publishes normalized route segments here.
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
 * Loads selected location histories on the bulk lane and publishes partial
 * route segments while each stream is still being read.
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
  const {
    setTracks,
    sourceKey: publishedSourceKey,
    tracks: publishedTracks,
  } = useContextValue();
  const playbackStore = useContext(PlaybackStoreContext);
  const requestedStreams =
    streams ?? locationSources.map((locationSource) => locationSource.id);
  const requestedStreamsKey = [...new Set(requestedStreams)].sort().join("\0");
  const progressCacheRef = React.useRef<{
    readonly budgetAccount: SourceReadBudgetAccount | null | undefined;
    readonly byStream: Map<string, BoundedLocationTrackProgress>;
    readonly session: EpisodeSession | null;
    readonly sourceKey: string | null;
  }>();
  if (
    progressCacheRef.current?.budgetAccount !== budgetAccount ||
    progressCacheRef.current?.session !== session ||
    progressCacheRef.current?.sourceKey !== sourceKey
  ) {
    progressCacheRef.current = {
      budgetAccount,
      byStream: new Map(),
      session,
      sourceKey,
    };
  }
  const boundedProgressByStream = progressCacheRef.current.byStream;
  useEffect(() => {
    const desiredStreams = new Set(
      requestedStreamsKey ? requestedStreamsKey.split("\0") : [],
    );
    for (const stream of boundedProgressByStream.keys()) {
      if (!desiredStreams.has(stream)) boundedProgressByStream.delete(stream);
    }
  }, [boundedProgressByStream, requestedStreamsKey]);
  const loadStream = useCallback(
    async ({
      commit,
      control,
      stream,
    }: DemandDrivenHistoryLoader<LocationTrackState>) => {
      if (!session) return;
      const index = locationSources.findIndex(
        (locationSource) => locationSource.id === stream,
      );
      const locationSource = locationSources[index];
      if (!locationSource) return;
      const baseState = {
        color: locationTrackColor(index),
        label: locationSource.label,
        pointCount: 0,
        segments: [],
        sourceName: locationSource.sourceName,
        stream,
      } satisfies Omit<LocationTrackState, "status">;
      let boundedProgress = boundedProgressByStream.get(stream);
      if (!boundedProgress) {
        commit({ ...baseState, status: "loading" });
        if (budgetAccount) {
          boundedProgress = {
            job: budgetAccount.createJob(),
            messageCount: 0,
            points: [],
            publishedPointCount: 0,
            truncated: false,
          };
          boundedProgressByStream.set(stream, boundedProgress);
        }
      }
      const points = boundedProgress?.points ?? [];
      let messageCount = boundedProgress?.messageCount ?? 0;
      let publishedPointCount = boundedProgress?.publishedPointCount ?? 0;
      let truncated = boundedProgress?.truncated ?? false;
      try {
        const consume = (batch: FrameBatch, mayStandDown: boolean) => {
          for (const frame of batch.frames) {
            if (control.isCancelled()) return false;
            messageCount += 1;
            if (mayStandDown && control.standDown()) return false;
            const visualization = frame.output.visualization;
            if (visualization?.kind !== VISUALIZATION_KIND.LOCATION) continue;
            points.push(
              locationPointFromVisualization(visualization, frame.timestampNs),
            );
          }
          if (
            points.length > 0 &&
            (publishedPointCount === 0 ||
              points.length - publishedPointCount >=
                LOCATION_TRACK_PROGRESS_POINT_INTERVAL)
          ) {
            const progress = decimateLocationTrackSegments(
              segmentLocationTrack(points),
            );
            publishedPointCount = points.length;
            commit({
              ...baseState,
              pointCount: progress.pointCount,
              segments: progress.segments,
              status: "loading",
              ...(progress.truncated ? { truncated: true } : {}),
            });
          }
          if (boundedProgress) {
            boundedProgress.messageCount = messageCount;
            boundedProgress.publishedPointCount = publishedPointCount;
            boundedProgress.truncated = truncated;
          }
          return true;
        };

        if (boundedProgress) {
          while (!control.isCancelled()) {
            if (control.standDown()) return;
            const result: BudgetedReadResult = await boundedProgress.job.read({
              budget: LOCATION_TRACK_GRANT_BUDGET,
              ...(boundedProgress.continuation
                ? { continuation: boundedProgress.continuation }
                : {}),
              signal: control.signal,
              streams: [stream],
              window: session.manifest.timeRange,
            });
            for (const batch of result.batches) {
              if (!consume(batch, false)) {
                boundedProgressByStream.delete(stream);
                return;
              }
            }
            const madeProgress =
              result.batches.length > 0 || result.usage.chunksOpened > 0;
            boundedProgress.continuation = result.continuation;
            if (
              !boundedProgress.continuation ||
              result.stopReason === "source-exhausted"
            ) {
              break;
            }
            if (
              !madeProgress ||
              result.stopReason === "oversized-source-unit"
            ) {
              truncated = true;
              break;
            }
          }
        } else {
          for await (const batch of session.read({
            limit: LOCATION_TRACK_READ_LIMIT,
            priority: "bulk",
            signal: control.signal,
            streams: [stream],
            window: session.manifest.timeRange,
          })) {
            if (!consume(batch, true)) return;
          }
        }

        const result = decimateLocationTrackSegments(
          segmentLocationTrack(points),
        );
        truncated =
          truncated ||
          result.truncated ||
          messageCount >= LOCATION_TRACK_READ_LIMIT;
        if (control.isCancelled()) {
          boundedProgressByStream.delete(stream);
          return;
        }
        commit({
          ...baseState,
          pointCount: result.pointCount,
          segments: result.segments,
          status: "ready",
          ...(truncated ? { truncated: true } : {}),
        });
        boundedProgressByStream.delete(stream);
      } catch {
        boundedProgressByStream.delete(stream);
        if (control.isCancelled()) return;
        commit({ ...baseState, status: "error" });
      }
    },
    [boundedProgressByStream, budgetAccount, locationSources, session],
  );
  const tracks = useDemandDrivenHistory({
    initialDelayMs: 0,
    isRetainable: isCompletedLocationTrack,
    loadStream,
    readIdentity: session,
    retryDelayMs: LOCATION_TRACK_DEFERRED_RETRY_MS,
    shouldStandDown: () => shouldDeferBulkHistory(playbackStore),
    sourceKey,
    streams: requestedStreams,
  });

  // This effect publishes the source-scoped cache to mounted map tiles.
  useLayoutEffect(() => {
    if (
      publishedTracks === tracks ||
      (publishedTracks.size === 0 &&
        tracks.size === 0 &&
        publishedSourceKey === null)
    ) {
      return;
    }
    setTracks(sourceKey, tracks);
  }, [publishedSourceKey, publishedTracks, setTracks, sourceKey, tracks]);

  // This effect clears provider state when the bridge unmounts.
  useEffect(
    () => () => {
      setTracks(null, EMPTY_LOCATION_TRACKS);
    },
    [setTracks],
  );

  return null;
}

function isCompletedLocationTrack(track: LocationTrackState): boolean {
  return track.status === "ready";
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
