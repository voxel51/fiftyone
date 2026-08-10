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

import type { ByteTimelinePoint, StreamSyncPolicies } from "../../../ir";
import type { PlaybackReadCapability } from "../../../ports";
import { isEpisodeReadCancelledError } from "../../../ports";
import { type EpisodeStreamCache, type TimelineIndex } from "../../../runtime";
import { markEpisodeLatencyEvent } from "../../../observability/episode-latency";
import { monotonicNowMs } from "../../../utils/monotonic-time";
import {
  activeStreamsInCaches,
  batchReadPriority,
  boundSpeculativeTicksByByteTimeline,
  bufferWindowCoverage,
  decodeFailuresByStream,
  distributeWindowToCaches,
  fillMissingLookaheadFrom,
  fillMissingStartupBufferFrom,
  playbackLookaheadSegments,
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
  /** Aborts every fallback/accelerated read owned by this source epoch. */
  cancel(): void;
  collectMissingTicksForStreams(
    startSec: number,
    endSec: number,
    maxTicks: number,
    streams: readonly string[],
    options?: { readonly endExclusive?: boolean },
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
  isStreamTimeAvailable = () => true,
  lastFrames,
  playback,
  publishStreamStatuses,
  rebalanceDecodedCaches,
  shouldAdmitBatch = () => true,
  store,
}: {
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly fetchState: DataStreamFetchState;
  readonly getIndex: () => TimelineIndex | null;
  readonly getPointCloudColorBy?: () => Readonly<Record<string, string>>;
  readonly getSourceEpoch: () => number;
  readonly getStreamPolicies: () => StreamSyncPolicies;
  /** Whether a stream may present content at one requested timeline time. */
  readonly isStreamTimeAvailable?: (stream: string, timeNs: bigint) => boolean;
  readonly lastFrames: Map<string, StreamPlaybackFrame<unknown>>;
  readonly playback: Pick<
    PlaybackReadCapability,
    "readSynchronized" | "readSynchronizedBatch"
  >;
  readonly publishStreamStatuses: () => void;
  readonly rebalanceDecodedCaches: () => void;
  /**
   * Admission boundary for speculative batch work. Returning false leaves the
   * ticks unclaimed so a later playback or idle pass can admit them.
   */
  readonly shouldAdmitBatch?: (operation: DataOperation) => boolean;
  readonly store: PlaybackStore;
}): DataStreamPrefetcher {
  const activeControllers = new Set<AbortController>();
  const createReadController = () => {
    const controller = new AbortController();
    activeControllers.add(controller);
    return controller;
  };
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

  const deliverWindows = ({
    activeStreams,
    sourceEpoch,
    streams,
    windows,
  }: {
    readonly activeStreams: readonly string[];
    readonly sourceEpoch: number;
    readonly streams: readonly string[];
    readonly windows: Parameters<typeof decodeFailuresByStream>[0];
  }): void => {
    if (getSourceEpoch() !== sourceEpoch) return;
    const decodeFailures = decodeFailuresByStream(windows);
    handleFetchSuccess(streams.filter((stream) => !decodeFailures.has(stream)));

    const activeFetchedStreams = activeStreamsInCaches(caches, streams);
    if (activeFetchedStreams.length === 0) return;

    for (const window of windows) {
      distributeWindowToCaches(
        window,
        caches,
        activeFetchedStreams.filter(
          (stream) => !window.diagnosticsByStream?.[stream],
        ),
        isStreamTimeAvailable,
      );
    }
    for (const [stream, failure] of decodeFailures) {
      handleFetchFailure(
        new Error(failure.messages.join("; ")),
        failure.ticks,
        [stream],
      );
    }
    rebalanceDecodedCaches();
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
  };

  const handleRejectedFetch = (
    error: unknown,
    sourceEpoch: number,
    ticks: readonly bigint[],
    streams: readonly string[],
  ): void => {
    if (getSourceEpoch() !== sourceEpoch) return;
    if (isEpisodeReadCancelledError(error)) return;
    handleFetchFailure(error, ticks, streams);
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
    if (!shouldAdmitBatch(operation)) return false;

    markStreamsPending(keys, streamsToFetch);
    const controller = createReadController();
    void playback
      .readSynchronizedBatch(
        {
          pointCloudColorBy: getPointCloudColorBy(),
          streamPolicies: getStreamPolicies(),
          streams: streamsToFetch,
          timeNs: toFetch,
        },
        {
          priority: batchReadPriority(operation),
          signal: controller.signal,
        },
      )
      .then((windows) => {
        deliverWindows({
          activeStreams,
          sourceEpoch,
          streams: streamsToFetch,
          windows,
        });
      })
      .catch((error) =>
        handleRejectedFetch(error, sourceEpoch, toFetch, streamsToFetch),
      )
      .finally(() => {
        activeControllers.delete(controller);
        finishFetch(sourceEpoch, keys, streamsToFetch);
      });

    return true;
  };

  /**
   * Keeps one target atomic so every newer target overlaps and supersedes the
   * whole stale read. The adapter shares index, chunk, and decode work across
   * all active streams while retaining synchronized stream semantics.
   */
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
    const controller = createReadController();
    void playback
      .readSynchronized({
        pointCloudColorBy: getPointCloudColorBy(),
        streamPolicies: getStreamPolicies(),
        streams: streamsToFetch,
        signal: controller.signal,
        timeNs: tick,
      })
      .then((window) => {
        deliverWindows({
          activeStreams,
          sourceEpoch,
          streams: streamsToFetch,
          windows: [window],
        });
      })
      .catch((error) =>
        handleRejectedFetch(error, sourceEpoch, [tick], streamsToFetch),
      )
      .finally(() => {
        activeControllers.delete(controller);
        finishFetch(sourceEpoch, [tickKey], streamsToFetch);
      });

    return true;
  };

  const collectMissingTicksForStreams: DataStreamPrefetcher["collectMissingTicksForStreams"] =
    (startSec, endSec, maxTicks, streams, options) => {
      const index = getIndex();
      if (!index || streams.length === 0) return [];
      const startNs = index.secToNs(startSec);
      const endNs = index.secToNs(endSec);
      const startIndex = index.indexAtOrAfter(startNs);
      const missing: bigint[] = [];
      for (let position = startIndex; position < index.tickCount; position++) {
        const tick = index.tickAt(position);
        if (
          tick === undefined ||
          (options?.endExclusive ? tick >= endNs : tick > endNs)
        ) {
          break;
        }
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
    cancel: () => {
      for (const controller of activeControllers) controller.abort();
      activeControllers.clear();
    },
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
  readonly getByteTimeline: () => readonly ByteTimelinePoint[] | null;
  readonly getBlockingStreams: () => ReadonlySet<string>;
  readonly getIndex: () => TimelineIndex | null;
  readonly getLastSeekAtMs: () => number | null;
  readonly hasDeferredBatchAdmission: () => boolean;
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
 * Coordinates current-frame reads, circular rolling lookahead, idle warmup,
 * and the single playback-engine stream without owning React state.
 */
export class DataStreamScheduler {
  private lastObservedCommitSec: number | null = null;
  private nextLookaheadRefreshTime = 0;

  constructor(private readonly options: DataStreamSchedulerOptions) {}

  private collectStartupTicks(
    startSec: number,
    endSec: number,
    maxTicks: number,
    activeStreams: string[],
  ): bigint[] {
    const { options } = this;
    const ticks = options.prefetcher.collectMissingTicksForStreams(
      startSec,
      endSec,
      maxTicks,
      activeStreams,
    );
    // Once the user has asked to play, the adaptive anti-stall cushion is
    // required playback work rather than paused speculation. Preserve that
    // existing contract; the engine already caps it in time and wall wait.
    if (getIsPlaying(options.store) || getIsPlayPending(options.store)) {
      return ticks;
    }
    const index = options.getIndex();
    if (!index) return [];
    return boundSpeculativeTicksByByteTimeline({
      anchorTimeNs: index.secToNs(startSec),
      byteTimeline: options.getByteTimeline(),
      maxBytes: options.policy.startupMaxCompressedBytes,
      maxChunks: options.policy.startupMaxChunks,
      ticks,
    });
  }

  resetSource(): void {
    this.lastObservedCommitSec = null;
    this.nextLookaheadRefreshTime = 0;
  }

  /**
   * Fills the bounded future horizon in playback order. The current loop tail
   * always gets first admission; only its unused horizon wraps to loop start.
   */
  private fillRollingLookaheadFrom(
    timeSec: number,
    activeStreams: string[],
    operation: Exclude<DataOperation, "loopback-lookahead">,
    lookaheadSeconds: number,
  ): boolean {
    const { options } = this;
    const index = options.getIndex();
    if (!index || activeStreams.length === 0) return false;

    const segments = playbackLookaheadSegments({
      durationSec: index.durationSec,
      lookaheadSeconds,
      loopEndSec: getLoopEnd(options.store),
      loopStartSec: getLoopStart(options.store),
      timeSec,
    });
    for (
      let segmentIndex = 0;
      segmentIndex < segments.length;
      segmentIndex += 1
    ) {
      const segment = segments[segmentIndex];
      const pausedMaxBytes = distributedBudget(
        options.policy.pausedWarmupMaxCompressedBytes,
        segmentIndex,
        segments.length,
      );
      const pausedMaxChunks = distributedBudget(
        options.policy.pausedWarmupMaxChunks,
        segmentIndex,
        segments.length,
      );
      if (
        fillMissingLookaheadFrom({
          activeStreams,
          collectMissingTicks: (startSec, endSec, maxTicks) => {
            const ticks = options.prefetcher.collectMissingTicksForStreams(
              startSec,
              endSec,
              maxTicks,
              activeStreams,
              { endExclusive: true },
            );
            return operation === "background-lookahead"
              ? boundSpeculativeTicksByByteTimeline({
                  anchorTimeNs: index.secToNs(segment.startSec),
                  byteTimeline: options.getByteTimeline(),
                  maxBytes: pausedMaxBytes,
                  maxChunks: pausedMaxChunks,
                  ticks,
                })
              : ticks;
          },
          fetchBatch: options.prefetcher.fetchBatch,
          lookaheadSeconds: segment.endSec - segment.startSec,
          operation:
            segment.kind === "loop-continuation" &&
            operation !== "background-lookahead"
              ? "loopback-lookahead"
              : operation,
          policy: options.policy,
          timeSec: segment.startSec,
        })
      ) {
        return true;
      }
    }
    return false;
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
    const currentTick = index.nearestTick(timeSec);
    if (
      currentTick === undefined ||
      !activeBlockingStreams.every((stream) =>
        options.caches.get(stream)?.has(currentTick),
      )
    ) {
      return false;
    }
    const pausedLookaheadSeconds = Math.min(
      options.policy.pausedWarmupRunwaySeconds,
      options.getBackgroundLookaheadSeconds(),
    );
    if (
      this.fillRollingLookaheadFrom(
        timeSec,
        activeBlockingStreams,
        "background-lookahead",
        pausedLookaheadSeconds,
      )
    ) {
      return true;
    }
    return this.fillRollingLookaheadFrom(
      timeSec,
      activeStreams,
      "background-lookahead",
      pausedLookaheadSeconds,
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
        this.collectStartupTicks(startSec, endSec, maxTicks, heavyStreams),
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

    const nativeStep = index.tickDurationSec;
    let lastCommittedTickKey: string | null = null;
    let pendingPlayRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let registered = true;
    const clearPendingPlayRetry = () => {
      if (pendingPlayRetryTimer === null) return;
      clearTimeout(pendingPlayRetryTimer);
      pendingPlayRetryTimer = null;
    };
    const stream: PlaybackStream = {
      id: STREAM_ID,
      blocking: true,
      duration: index.durationSec,
      nativeStepSeconds: nativeStep,
      get lookaheadSeconds() {
        if (options.getActiveBlockingStreams().length === 0) return 0;
        return getIsPlaying(options.store)
          ? options.getBackgroundLookaheadSeconds()
          : options.resolveStartupCushion().cushionSeconds;
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
          const missing = this.collectStartupTicks(
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
        // Idle cancellation rejects its promises immediately, but per-tick
        // pending ownership is released from their finally handlers. Retry on
        // the next task so required play-start runway is admitted after that
        // cleanup rather than being skipped behind stale idle markers.
        if (options.hasDeferredBatchAdmission()) {
          clearPendingPlayRetry();
          pendingPlayRetryTimer = setTimeout(() => {
            pendingPlayRetryTimer = null;
            if (!registered || !getIsPlayPending(options.store)) return;
            this.prefetchLookaheadFrom(getPlayhead(options.store));
          }, 0);
        }
      } else {
        clearPendingPlayRetry();
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
            this.collectStartupTicks(
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
      const operation =
        getIsPlaying(options.store) || getIsPlayPending(options.store)
          ? "playback-prefetch"
          : "background-lookahead";
      this.fillRollingLookaheadFrom(
        timeSec,
        activeStreams,
        operation,
        options.getBackgroundLookaheadSeconds(),
      );
    });

    return () => {
      registered = false;
      clearPendingPlayRetry();
      unregister();
      unsubscribe();
      unsubPlayPending();
      unsubCurrentTime();
    };
  }
}

function distributedBudget(
  total: number,
  segmentIndex: number,
  segmentCount: number,
): number {
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    !Number.isSafeInteger(segmentIndex) ||
    segmentIndex < 0 ||
    !Number.isSafeInteger(segmentCount) ||
    segmentCount <= 0 ||
    segmentIndex >= segmentCount
  ) {
    return 0;
  }
  const base = Math.floor(total / segmentCount);
  return base + (segmentIndex < total % segmentCount ? 1 : 0);
}
