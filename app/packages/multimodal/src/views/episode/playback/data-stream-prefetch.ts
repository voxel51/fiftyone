import {
  getCurrentTime,
  getIsPlayPending,
  getIsPlaying,
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  subscribeCurrentTime,
  subscribeIsPlayPending,
  type PlaybackStore,
  type PlaybackStream,
} from "@fiftyone/playback";

import type { StreamSyncPolicies } from "../../../ir";
import type { PlaybackReadCapability } from "../../../ports";
import { isEpisodeReadCancelledError } from "../../../ports";
import {
  DEFAULT_TIMELINE_TICK_RATE_HZ,
  type EpisodeStreamCache,
  type TimelineIndex,
} from "../../../runtime";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import {
  activeStreamsInCaches,
  batchReadPriority,
  bufferWindowCoverage,
  decodeFailuresByStream,
  distributeWindowToCaches,
  fillMissingLookaheadFrom,
  fillMissingStartupBufferFrom,
  type DataOperation,
  type DerivedPlaybackPolicy,
} from "./playback-buffering";
import { pushTickToStore } from "./playback-frame-push";
import {
  getNetworkHealth,
  shouldDeferIdleWorkForStore,
} from "./network-health";
import {
  MAX_STARTUP_CUSHION_WAIT_SECONDS,
  type StartupCushion,
  type StartupCushionPlanner,
} from "./startup-cushion";
import type { StreamPlaybackFrame } from "./use-stream-values";

/** Fetch attempts allowed before a broken stream is sealed as empty. */
export const MAX_FETCH_FAILURE_STREAK = 3;
const STREAM_ID = "episode-data-stream";
const MAX_ENGINE_PREFETCH_BATCHES_PER_CALL = 8;
const EMPTY_POINT_CLOUD_COLOR_BY: Readonly<Record<string, string>> = {};

/** Mutable request bookkeeping owned by one mounted episode data stream. */
export interface DataStreamFetchState {
  readonly failedStreams: Set<string>;
  readonly failureStreaks: Map<string, number>;
  readonly pendingStreamsByTick: Map<string, Set<string>>;
}

/** Creates isolated request bookkeeping for an episode data stream. */
export function createDataStreamFetchState(): DataStreamFetchState {
  return {
    failedStreams: new Set(),
    failureStreaks: new Map(),
    pendingStreamsByTick: new Map(),
  };
}

/** Clears all source-local request and failure bookkeeping. */
export function resetDataStreamFetchState(state: DataStreamFetchState): void {
  state.failedStreams.clear();
  state.failureStreaks.clear();
  state.pendingStreamsByTick.clear();
}

/** Imperative foreground/background fetch surface consumed by the hook. */
export interface DataStreamPrefetcher {
  collectMissingTicksForStreams(
    startSec: number,
    endSec: number,
    maxTicks: number,
    streams: readonly string[],
  ): bigint[];
  fetchBatch(
    ticks: bigint[],
    activeStreams: string[],
    operation: DataOperation,
  ): boolean;
  fetchCurrentFrame(tick: bigint, activeStreams: string[]): boolean;
  isStreamPending(tickKey: string, stream: string): boolean;
}

/**
 * Owns synchronized reads, pending-tick deduplication, failure isolation, and
 * cache delivery. React remains responsible only for deciding when to ask for
 * foreground or speculative work.
 */
export function createDataStreamPrefetcher({
  caches,
  fetchState,
  getIndex,
  getPointCloudColorBy = () => EMPTY_POINT_CLOUD_COLOR_BY,
  getSourceEpoch,
  getStreamPolicies,
  lastFrames,
  playback,
  publishStreamStatuses,
  rebalanceDecodedCaches,
  store,
}: {
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly fetchState: DataStreamFetchState;
  readonly getIndex: () => TimelineIndex | null;
  readonly getPointCloudColorBy?: () => Readonly<Record<string, string>>;
  readonly getSourceEpoch: () => number;
  readonly getStreamPolicies: () => StreamSyncPolicies;
  readonly lastFrames: Map<string, StreamPlaybackFrame<unknown>>;
  readonly playback: Pick<
    PlaybackReadCapability,
    "readSynchronized" | "readSynchronizedBatch"
  >;
  readonly publishStreamStatuses: () => void;
  readonly rebalanceDecodedCaches: (pruneSpeculative: boolean) => void;
  readonly store: PlaybackStore;
}): DataStreamPrefetcher {
  const isStreamPending = (tickKey: string, stream: string): boolean =>
    fetchState.pendingStreamsByTick.get(tickKey)?.has(stream) ?? false;

  const markStreamsPending = (
    tickKeys: readonly string[],
    streams: readonly string[],
  ): void => {
    for (const key of tickKeys) {
      let covered = fetchState.pendingStreamsByTick.get(key);
      if (!covered) {
        covered = new Set();
        fetchState.pendingStreamsByTick.set(key, covered);
      }
      for (const stream of streams) covered.add(stream);
    }
  };

  const clearStreamsPending = (
    tickKeys: readonly string[],
    streams: readonly string[],
  ): void => {
    for (const key of tickKeys) {
      const covered = fetchState.pendingStreamsByTick.get(key);
      if (!covered) continue;
      for (const stream of streams) covered.delete(stream);
      if (covered.size === 0) fetchState.pendingStreamsByTick.delete(key);
    }
  };

  const handleFetchSuccess = (streams: readonly string[]): void => {
    for (const stream of streams) {
      fetchState.failureStreaks.delete(stream);
      fetchState.failedStreams.delete(stream);
    }
  };

  const handleFetchFailure = (
    error: unknown,
    ticks: readonly bigint[],
    streams: readonly string[],
  ): void => {
    const newlyFailed: string[] = [];
    for (const stream of streams) {
      const streak = (fetchState.failureStreaks.get(stream) ?? 0) + 1;
      fetchState.failureStreaks.set(stream, streak);
      if (streak < MAX_FETCH_FAILURE_STREAK) continue;
      if (!fetchState.failedStreams.has(stream)) {
        fetchState.failedStreams.add(stream);
        newlyFailed.push(stream);
      }
      const cache = caches.get(stream);
      if (cache?.isActive) {
        for (const tick of ticks) {
          if (!cache.has(tick)) cache.set(tick, null);
        }
      }
    }
    if (newlyFailed.length > 0) {
      console.warn(
        `[episode] giving up on streams after ${MAX_FETCH_FAILURE_STREAK} failed fetches:`,
        newlyFailed,
        error,
      );
    }
  };

  const finishFetch = (
    sourceEpoch: number,
    tickKeys: readonly string[],
    streams: readonly string[],
  ): void => {
    if (getSourceEpoch() !== sourceEpoch) return;
    clearStreamsPending(tickKeys, streams);
    publishStreamStatuses();
  };

  const fetchBatch: DataStreamPrefetcher["fetchBatch"] = (
    ticks,
    activeStreams,
    operation,
  ) => {
    if (ticks.length === 0 || activeStreams.length === 0) return false;

    const sourceEpoch = getSourceEpoch();
    const toFetch = ticks.filter((tick) => {
      const tickKey = tick.toString();
      return activeStreams.some((stream) => !isStreamPending(tickKey, stream));
    });
    if (toFetch.length === 0) return false;

    const keys = toFetch.map((tick) => tick.toString());
    const streamsToFetch = activeStreams.filter((stream) =>
      toFetch.some((tick) => {
        const tickKey = tick.toString();
        return (
          !caches.get(stream)?.has(tick) && !isStreamPending(tickKey, stream)
        );
      }),
    );
    if (streamsToFetch.length === 0) return false;

    markStreamsPending(keys, streamsToFetch);
    void playback
      .readSynchronizedBatch(
        {
          pointCloudColorBy: getPointCloudColorBy(),
          streamPolicies: getStreamPolicies(),
          streams: streamsToFetch,
          timeNs: toFetch,
        },
        { priority: batchReadPriority(operation) },
      )
      .then((windows) => {
        if (getSourceEpoch() !== sourceEpoch) return;
        const decodeFailures = decodeFailuresByStream(windows);
        handleFetchSuccess(
          streamsToFetch.filter((stream) => !decodeFailures.has(stream)),
        );

        const activeFetchedStreams = activeStreamsInCaches(
          caches,
          streamsToFetch,
        );
        if (activeFetchedStreams.length === 0) return;

        for (const window of windows) {
          distributeWindowToCaches(
            window,
            caches,
            activeFetchedStreams.filter(
              (stream) => !window.diagnosticsByStream?.[stream],
            ),
            { pinned: operation === "loopback-lookahead" },
          );
        }
        for (const [stream, failure] of decodeFailures) {
          handleFetchFailure(
            new Error(failure.messages.join("; ")),
            failure.ticks,
            [stream],
          );
        }
        rebalanceDecodedCaches(operation === "background-lookahead");
        const currentIndex = getIndex();
        if (!currentIndex) return;
        const tick = currentIndex.nearestTick(getPlayhead(store));
        if (tick !== undefined) {
          pushTickToStore(
            activeStreamsInCaches(caches, activeStreams),
            tick,
            caches,
            lastFrames,
            store,
            fetchState.failedStreams,
          );
        }
      })
      .catch((error) => {
        if (getSourceEpoch() !== sourceEpoch) return;
        if (isEpisodeReadCancelledError(error)) return;
        handleFetchFailure(error, toFetch, streamsToFetch);
      })
      .finally(() => finishFetch(sourceEpoch, keys, streamsToFetch));

    return true;
  };

  const fetchCurrentFrame: DataStreamPrefetcher["fetchCurrentFrame"] = (
    tick,
    activeStreams,
  ) => {
    if (activeStreams.length === 0) return false;

    const sourceEpoch = getSourceEpoch();
    const tickKey = tick.toString();
    const streamsToFetch = activeStreams.filter(
      (stream) =>
        !caches.get(stream)?.has(tick) && !isStreamPending(tickKey, stream),
    );
    if (streamsToFetch.length === 0) return false;

    markStreamsPending([tickKey], streamsToFetch);
    void playback
      .readSynchronized({
        pointCloudColorBy: getPointCloudColorBy(),
        streamPolicies: getStreamPolicies(),
        streams: streamsToFetch,
        timeNs: tick,
      })
      .then((window) => {
        if (getSourceEpoch() !== sourceEpoch) return;
        const decodeFailures = decodeFailuresByStream([window]);
        handleFetchSuccess(
          streamsToFetch.filter((stream) => !decodeFailures.has(stream)),
        );

        const activeFetchedStreams = activeStreamsInCaches(
          caches,
          streamsToFetch,
        );
        if (activeFetchedStreams.length === 0) return;

        distributeWindowToCaches(
          window,
          caches,
          activeFetchedStreams.filter(
            (stream) => !window.diagnosticsByStream?.[stream],
          ),
        );
        for (const [stream, failure] of decodeFailures) {
          handleFetchFailure(
            new Error(failure.messages.join("; ")),
            failure.ticks,
            [stream],
          );
        }
        rebalanceDecodedCaches(false);
        const currentIndex = getIndex();
        const currentTick = currentIndex?.nearestTick(getPlayhead(store));
        if (currentTick !== undefined) {
          pushTickToStore(
            activeStreamsInCaches(caches, activeStreams),
            currentTick,
            caches,
            lastFrames,
            store,
            fetchState.failedStreams,
          );
        }
      })
      .catch((error) => {
        if (getSourceEpoch() !== sourceEpoch) return;
        if (isEpisodeReadCancelledError(error)) return;
        handleFetchFailure(error, [tick], streamsToFetch);
      })
      .finally(() => finishFetch(sourceEpoch, [tickKey], streamsToFetch));

    return true;
  };

  const collectMissingTicksForStreams: DataStreamPrefetcher["collectMissingTicksForStreams"] =
    (startSec, endSec, maxTicks, streams) => {
      const index = getIndex();
      if (!index || streams.length === 0) return [];
      const startNs = index.secToNs(startSec);
      const endNs = index.secToNs(endSec);
      const startIndex = index.indexAtOrAfter(startNs);
      const missing: bigint[] = [];
      for (let position = startIndex; position < index.tickCount; position++) {
        const tick = index.tickAt(position);
        if (tick === undefined || tick > endNs) break;
        const tickKey = tick.toString();
        if (
          streams.some(
            (stream) =>
              !caches.get(stream)?.has(tick) &&
              !isStreamPending(tickKey, stream),
          )
        ) {
          missing.push(tick);
        }
        if (missing.length >= maxTicks) break;
      }
      return missing;
    };

  return {
    collectMissingTicksForStreams,
    fetchBatch,
    fetchCurrentFrame,
    isStreamPending,
  };
}

/** Dependencies required by the rolling episode prefetch scheduler. */
export interface DataStreamSchedulerOptions {
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly cancelIdle: () => void;
  readonly computeBufferedRanges: () => Array<[number, number]>;
  readonly failedStreams: ReadonlySet<string>;
  readonly getActiveBlockingStreams: () => string[];
  readonly getActiveStreams: () => string[];
  readonly getBackgroundLookaheadSeconds: () => number;
  readonly getBlockingStreams: () => ReadonlySet<string>;
  readonly getIndex: () => TimelineIndex | null;
  readonly getLastSeekAtMs: () => number | null;
  readonly isSourceAvailable: () => boolean;
  readonly lastFrames: Map<string, StreamPlaybackFrame<unknown>>;
  readonly policy: DerivedPlaybackPolicy;
  readonly prefetcher: DataStreamPrefetcher;
  readonly publishStreamStatuses: () => void;
  readonly resolveStartupCushion: () => StartupCushion;
  readonly startupCushionPlanner: StartupCushionPlanner;
  readonly store: PlaybackStore;
}

/**
 * Coordinates current-frame reads, rolling lookahead, loopback runway, idle
 * warmup, and the single playback-engine stream without owning React state.
 */
export class DataStreamScheduler {
  private lastObservedCommitSec: number | null = null;
  private loopRunwayStartTickKey: string | null = null;
  private nextLookaheadRefreshTime = 0;

  constructor(private readonly options: DataStreamSchedulerOptions) {}

  resetSource(): void {
    this.lastObservedCommitSec = null;
    this.loopRunwayStartTickKey = null;
    this.nextLookaheadRefreshTime = 0;
  }

  warmLoopStartRunway(timeSec: number, activeStreams: string[]): boolean {
    const { options } = this;
    const index = options.getIndex();
    if (!index || activeStreams.length === 0) return false;

    const loopStartSec = getLoopStart(options.store);
    const loopEndSec = getLoopEnd(options.store);
    if (loopEndSec <= loopStartSec) return false;
    if (timeSec <= loopStartSec + options.policy.startupLookaheadSeconds) {
      return false;
    }
    const secondsToLoopEnd = loopEndSec - timeSec;
    const lookaheadSeconds = options.getBackgroundLookaheadSeconds();
    if (secondsToLoopEnd < 0 || secondsToLoopEnd > lookaheadSeconds) {
      return false;
    }

    const loopStartTick = index.nearestTick(loopStartSec);
    if (loopStartTick === undefined) return false;
    const loopStartTickKey = loopStartTick.toString();
    if (this.loopRunwayStartTickKey !== loopStartTickKey) {
      this.loopRunwayStartTickKey = loopStartTickKey;
      for (const cache of options.caches.values()) cache.clearPinned();
    }

    const missing = options.prefetcher.collectMissingTicksForStreams(
      loopStartSec,
      loopStartSec + lookaheadSeconds,
      options.policy.maxPrefetchBatch,
      activeStreams,
    );
    return (
      missing.length > 0 &&
      options.prefetcher.fetchBatch(
        missing,
        activeStreams,
        "loopback-lookahead",
      )
    );
  }

  runPausedIdleWarmup(): boolean {
    const { options } = this;
    const index = options.getIndex();
    if (
      !index ||
      !options.isSourceAvailable() ||
      getIsPlaying(options.store) ||
      getIsPlayPending(options.store)
    ) {
      return false;
    }

    const timeSec = getPlayhead(options.store);
    const activeStreams = options.getActiveStreams();
    const activeBlockingStreams = options.getActiveBlockingStreams();
    if (activeStreams.length === 0 || activeBlockingStreams.length === 0) {
      return false;
    }
    const startupCoverage = bufferWindowCoverage({
      activeStreams: activeBlockingStreams,
      caches: options.caches,
      index,
      lookaheadSeconds: options.policy.startupLookaheadSeconds,
      maxTicks: options.policy.startupMaxPrefetchBatch,
      timeSec,
    });
    if (
      !startupCoverage?.total ||
      startupCoverage.covered < startupCoverage.total
    ) {
      return false;
    }
    if (this.warmLoopStartRunway(timeSec, activeStreams)) return true;

    const endSec =
      timeSec +
      Math.min(
        options.policy.pausedWarmupRunwaySeconds,
        options.getBackgroundLookaheadSeconds(),
      );
    const blockingMissing = options.prefetcher.collectMissingTicksForStreams(
      timeSec,
      endSec,
      options.policy.maxPrefetchBatch,
      activeBlockingStreams,
    );
    if (
      blockingMissing.length > 0 &&
      options.prefetcher.fetchBatch(
        blockingMissing,
        activeBlockingStreams,
        "background-lookahead",
      )
    ) {
      return true;
    }
    const allMissing = options.prefetcher.collectMissingTicksForStreams(
      timeSec,
      endSec,
      options.policy.maxPrefetchBatch,
      activeStreams,
    );
    return (
      allMissing.length > 0 &&
      options.prefetcher.fetchBatch(
        allMissing,
        activeStreams,
        "background-lookahead",
      )
    );
  }

  prefetchLookaheadFrom(timeSec: number): void {
    const { options } = this;
    const index = options.getIndex();
    if (!index) return;
    const activeStreams = options.getActiveStreams();
    if (activeStreams.length === 0) return;
    this.nextLookaheadRefreshTime = timeSec;

    const blockingSet = options.getBlockingStreams();
    const activeBlockingStreams = activeStreams.filter((stream) =>
      blockingSet.has(stream),
    );
    const overlayStreams =
      activeBlockingStreams.length > 0
        ? activeStreams.filter((stream) => !blockingSet.has(stream))
        : [];
    const heavyStreams =
      activeBlockingStreams.length > 0 ? activeBlockingStreams : activeStreams;
    const tick = index.nearestTick(timeSec);
    if (tick !== undefined) {
      pushTickToStore(
        activeStreams,
        tick,
        options.caches,
        options.lastFrames,
        options.store,
        options.failedStreams,
      );
      options.prefetcher.fetchCurrentFrame(tick, heavyStreams);
      if (overlayStreams.length > 0) {
        options.prefetcher.fetchCurrentFrame(tick, overlayStreams);
      }
    }
    fillMissingStartupBufferFrom({
      activeStreams: heavyStreams,
      collectMissingTicks: (startSec, endSec, maxTicks) =>
        options.prefetcher.collectMissingTicksForStreams(
          startSec,
          endSec,
          maxTicks,
          heavyStreams,
        ),
      fetchBatch: options.prefetcher.fetchBatch,
      policy: options.policy,
      timeSec,
    });
    options.publishStreamStatuses();
  }

  register(
    registerStream: (stream: PlaybackStream) => () => void,
    subscribeStream: (streamId: string) => () => void,
  ): () => void {
    const { options } = this;
    const index = options.getIndex();
    if (!index || !options.isSourceAvailable()) return () => undefined;

    const nativeStep = 1 / DEFAULT_TIMELINE_TICK_RATE_HZ;
    let lastCommittedTickKey: string | null = null;
    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      get lookaheadSeconds() {
        if (options.getActiveBlockingStreams().length === 0) return 0;
        return options.resolveStartupCushion().cushionSeconds;
      },
      get startupBufferSeconds() {
        if (options.getActiveBlockingStreams().length === 0) return 0;
        return options.resolveStartupCushion().cushionSeconds;
      },
      startupBufferMaxWaitSeconds: MAX_STARTUP_CUSHION_WAIT_SECONDS,
      bufferedRanges: options.computeBufferedRanges,
      bufferState: (timeSec) => {
        const tick = index.nearestTick(timeSec);
        if (tick === undefined) return "missing";
        const activeStreams = options.getActiveBlockingStreams();
        if (activeStreams.length === 0) return "ready";
        const tickKey = tick.toString();
        let missingStreams = 0;
        let pendingStreams = 0;
        for (const streamId of activeStreams) {
          if (options.caches.get(streamId)?.has(tick)) continue;
          if (options.prefetcher.isStreamPending(tickKey, streamId)) {
            pendingStreams += 1;
          } else {
            missingStreams += 1;
          }
        }
        return missingStreams > 0
          ? "missing"
          : pendingStreams > 0
            ? "loading"
            : "ready";
      },
      prefetch: ([startSec, endSec]) => {
        const activeStreams = options.getActiveStreams();
        const tick = index.nearestTick(startSec);
        if (tick !== undefined) {
          options.prefetcher.fetchCurrentFrame(tick, activeStreams);
        }
        for (
          let batch = 0;
          batch < MAX_ENGINE_PREFETCH_BATCHES_PER_CALL;
          batch++
        ) {
          const missing = options.prefetcher.collectMissingTicksForStreams(
            startSec,
            endSec,
            options.policy.maxPrefetchBatch,
            activeStreams,
          );
          if (missing.length === 0) break;
          if (
            !options.prefetcher.fetchBatch(
              missing,
              activeStreams,
              "playback-prefetch",
            )
          ) {
            break;
          }
        }
        options.publishStreamStatuses();
      },
      onCommit: (timeSec, commitStore) => {
        const tick = index.nearestTick(timeSec);
        if (tick === undefined) return;
        const tickKey = tick.toString();
        if (lastCommittedTickKey === tickKey) return;
        lastCommittedTickKey = tickKey;
        pushTickToStore(
          options.getActiveStreams(),
          tick,
          options.caches,
          options.lastFrames,
          commitStore,
          options.failedStreams,
        );
        options.publishStreamStatuses();
      },
    };

    const unregister = registerStream(stream);
    const unsubscribe = subscribeStream(STREAM_ID);
    const unsubPlayPending = subscribeIsPlayPending(options.store, () => {
      if (getIsPlayPending(options.store)) {
        options.cancelIdle();
      } else {
        options.startupCushionPlanner.resetPendingPlan();
      }
      options.publishStreamStatuses();
    });
    const unsubCurrentTime = subscribeCurrentTime(options.store, () => {
      const timeSec = getCurrentTime(options.store);
      const movedBackward =
        this.lastObservedCommitSec !== null &&
        timeSec + nativeStep < this.lastObservedCommitSec;
      this.lastObservedCommitSec = timeSec;
      if (movedBackward) this.nextLookaheadRefreshTime = 0;
      if (getIsPlaying(options.store)) {
        options.startupCushionPlanner.resetPendingPlan();
      }
      if (timeSec < this.nextLookaheadRefreshTime) return;
      this.nextLookaheadRefreshTime =
        timeSec + options.policy.prefetchRefreshSeconds;
      const activeStreams = options.getActiveStreams();
      if (activeStreams.length === 0) return;
      const activeBlockingStreams = options.getActiveBlockingStreams();

      const startupCoverage = bufferWindowCoverage({
        activeStreams: activeBlockingStreams,
        caches: options.caches,
        index,
        lookaheadSeconds: options.policy.startupLookaheadSeconds,
        maxTicks: options.policy.startupMaxPrefetchBatch,
        timeSec,
      });
      if (
        startupCoverage?.total &&
        startupCoverage.covered < startupCoverage.total
      ) {
        fillMissingStartupBufferFrom({
          activeStreams: activeBlockingStreams,
          collectMissingTicks: (startSec, endSec, maxTicks) =>
            options.prefetcher.collectMissingTicksForStreams(
              startSec,
              endSec,
              maxTicks,
              activeBlockingStreams,
            ),
          fetchBatch: options.prefetcher.fetchBatch,
          policy: options.policy,
          timeSec,
        });
        if (
          !getIsPlaying(options.store) ||
          getNetworkHealth(options.store).limited
        ) {
          return;
        }
      }
      const lastSeekAtMs = options.getLastSeekAtMs();
      if (
        shouldDeferIdleWorkForStore(
          options.store,
          lastSeekAtMs === null ? null : monotonicNowMs() - lastSeekAtMs,
        )
      ) {
        return;
      }
      if (this.warmLoopStartRunway(timeSec, activeStreams)) return;
      const operation =
        getIsPlaying(options.store) || getIsPlayPending(options.store)
          ? "playback-prefetch"
          : "background-lookahead";
      fillMissingLookaheadFrom({
        activeStreams,
        collectMissingTicks: (startSec, endSec, maxTicks) =>
          options.prefetcher.collectMissingTicksForStreams(
            startSec,
            endSec,
            maxTicks,
            activeStreams,
          ),
        fetchBatch: options.prefetcher.fetchBatch,
        lookaheadSeconds: options.getBackgroundLookaheadSeconds(),
        operation,
        policy: options.policy,
        timeSec,
      });
    });

    return () => {
      unregister();
      unsubscribe();
      unsubPlayPending();
      unsubCurrentTime();
    };
  }
}
