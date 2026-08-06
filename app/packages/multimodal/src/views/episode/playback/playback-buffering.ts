import {
  setBufferedRanges,
  setBufferingDetail,
  setBufferingStreams,
  setIsBuffering,
  type PlaybackStore,
} from "@fiftyone/playback";
import type {
  ByteTimelinePoint,
  DecodedFrame,
  SynchronizedFrameWindow,
} from "../../../ir";
import {
  assertValidTimelineTickRateHz,
  DEFAULT_TIMELINE_TICK_RATE_HZ,
  EPISODE_STREAM_CACHE_EMERGENCY_MAX_ENTRIES,
  intersectTickRanges,
  type EpisodeStreamCache,
  type TimelineIndex,
} from "../../../runtime";

/** Read lanes used by the episode playback prefetch scheduler. */
export type DataOperation =
  | "background-lookahead"
  | "loopback-lookahead"
  | "playback-prefetch"
  | "startup-lookahead";

/** Human-scale settings for startup and rolling episode buffering. */
export interface PlaybackPolicy {
  readonly lookaheadSeconds: number;
  readonly pausedWarmupMaxCompressedBytes: number;
  readonly pausedWarmupMaxChunks: number;
  readonly startupBufferSeconds: number;
  readonly startupMaxCompressedBytes: number;
  readonly startupMaxChunks: number;
  readonly startupMinTicks: number;
  readonly pausedWarmupRunwaySeconds: number;
  readonly prefetchBatchSeconds: number;
  readonly prefetchBatchesPerPass: number;
  readonly prefetchRefreshSeconds: number;
  /** Wide defense-in-depth ceiling shared by coordinated stream caches. */
  readonly cachePlacementCeiling: number;
  /** Last-resort per-stream cap if coordinated rebalancing cannot run. */
  readonly streamCacheEmergencyMaxEntries: number;
}

/** Playback policy resolved into concrete timeline and cache limits. */
export interface DerivedPlaybackPolicy extends PlaybackPolicy {
  readonly maxPrefetchBatch: number;
  readonly startupLookaheadSeconds: number;
  readonly startupMaxPrefetchBatch: number;
  readonly streamCacheMaxEntries: number;
}

/** One contiguous portion of the next playback-order lookahead horizon. */
export interface PlaybackLookaheadSegment {
  readonly endSec: number;
  readonly kind: "current" | "loop-continuation";
  readonly startSec: number;
}

/** Longest pre-data gap that initial episode setup advances automatically. */
export const INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS = 0.5;

/** Default buffering policy for episode playback. */
export const DEFAULT_PLAYBACK_POLICY: PlaybackPolicy = {
  lookaheadSeconds: 4,
  pausedWarmupMaxCompressedBytes: 128 * 1024 * 1024,
  pausedWarmupMaxChunks: 64,
  pausedWarmupRunwaySeconds: 1.5,
  prefetchBatchSeconds: 1,
  prefetchBatchesPerPass: 1,
  prefetchRefreshSeconds: 0.5,
  startupBufferSeconds: INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS,
  startupMaxCompressedBytes: 96 * 1024 * 1024,
  startupMaxChunks: 32,
  startupMinTicks: 3,
  // At 30 Hz this permits more than an hour for one stream, while the shared
  // ceiling and decoded-byte budget normally intervene much earlier. It is a
  // defense against underestimated payloads and metadata-only/null placement
  // growth, not an ordinary lookahead-derived eviction target.
  cachePlacementCeiling: EPISODE_STREAM_CACHE_EMERGENCY_MAX_ENTRIES,
  streamCacheEmergencyMaxEntries: EPISODE_STREAM_CACHE_EMERGENCY_MAX_ENTRIES,
};

/** Resolves a playback policy against the active timeline tick rate. */
export function derivePlaybackPolicy(
  policy: PlaybackPolicy,
  tickRateHz = DEFAULT_TIMELINE_TICK_RATE_HZ,
): DerivedPlaybackPolicy {
  assertValidTimelineTickRateHz(tickRateHz, "Playback");
  // Keep the amount of media buffered stable as sampling fidelity changes.
  // Tick-count limits are derived from these durations below.
  const startupLookaheadSeconds = policy.startupBufferSeconds;
  const pausedWarmupRunwaySeconds = clampNumber(
    policy.pausedWarmupRunwaySeconds,
    startupLookaheadSeconds,
    policy.lookaheadSeconds,
  );
  return {
    ...policy,
    maxPrefetchBatch: Math.ceil(tickRateHz * policy.prefetchBatchSeconds),
    pausedWarmupRunwaySeconds,
    startupLookaheadSeconds,
    startupMaxPrefetchBatch: Math.max(
      policy.startupMinTicks,
      Math.ceil(tickRateHz * startupLookaheadSeconds),
    ),
    streamCacheMaxEntries: policy.streamCacheEmergencyMaxEntries,
  };
}

/** Maps scheduler operations onto the resource client's read priorities. */
export function batchReadPriority(
  operation: DataOperation,
): "idle" | "playback" {
  return operation === "background-lookahead" ? "idle" : "playback";
}

/**
 * Resolves the next bounded lookahead horizon in playback order.
 *
 * Inside an active loop, lookahead is circular: the portion before `loopEnd`
 * stays on the current tail and only the remainder wraps to `loopStart`. The
 * total protected/fetched duration therefore never exceeds `lookaheadSeconds`;
 * loop continuation does not create a second cache allowance.
 */
export function playbackLookaheadSegments({
  durationSec,
  lookaheadSeconds,
  loopEndSec,
  loopStartSec,
  timeSec,
}: {
  readonly durationSec: number;
  readonly lookaheadSeconds: number;
  readonly loopEndSec: number;
  readonly loopStartSec: number;
  readonly timeSec: number;
}): PlaybackLookaheadSegment[] {
  if (
    !Number.isFinite(durationSec) ||
    !Number.isFinite(lookaheadSeconds) ||
    !Number.isFinite(loopEndSec) ||
    !Number.isFinite(loopStartSec) ||
    !Number.isFinite(timeSec) ||
    durationSec < 0 ||
    lookaheadSeconds <= 0
  ) {
    return [];
  }

  const clampedTimeSec = clampNumber(timeSec, 0, durationSec);
  const ordinaryEndSec = Math.min(
    durationSec,
    clampedTimeSec + lookaheadSeconds,
  );
  const hasActiveLoop =
    loopEndSec > loopStartSec &&
    clampedTimeSec >= loopStartSec &&
    clampedTimeSec <= loopEndSec;
  if (!hasActiveLoop) {
    return ordinaryEndSec > clampedTimeSec
      ? [
          {
            endSec: ordinaryEndSec,
            kind: "current",
            startSec: clampedTimeSec,
          },
        ]
      : [];
  }

  const boundedLoopStartSec = clampNumber(loopStartSec, 0, durationSec);
  const boundedLoopEndSec = clampNumber(
    loopEndSec,
    boundedLoopStartSec,
    durationSec,
  );
  const loopDurationSec = boundedLoopEndSec - boundedLoopStartSec;
  if (loopDurationSec <= 0) return [];

  const horizonSeconds = Math.min(lookaheadSeconds, loopDurationSec);
  const tailSeconds = Math.min(
    horizonSeconds,
    Math.max(0, boundedLoopEndSec - clampedTimeSec),
  );
  const segments: PlaybackLookaheadSegment[] = [];
  if (tailSeconds > 0) {
    segments.push({
      endSec: clampedTimeSec + tailSeconds,
      kind: "current",
      startSec: clampedTimeSec,
    });
  }

  const continuationSeconds = horizonSeconds - tailSeconds;
  if (continuationSeconds > 0) {
    segments.push({
      endSec: boundedLoopStartSec + continuationSeconds,
      kind: "loop-continuation",
      startSec: boundedLoopStartSec,
    });
  }
  return segments;
}

/** Queues bounded batches for missing rolling lookahead. */
export function fillMissingLookaheadFrom({
  activeStreams,
  collectMissingTicks,
  fetchBatch,
  lookaheadSeconds,
  operation = "background-lookahead",
  policy,
  timeSec,
}: {
  readonly activeStreams: string[];
  readonly collectMissingTicks: (
    startSec: number,
    endSec: number,
    maxTicks: number,
  ) => bigint[];
  readonly fetchBatch: (
    ticks: bigint[],
    activeStreams: string[],
    operation: DataOperation,
  ) => boolean;
  readonly lookaheadSeconds: number;
  readonly operation?: DataOperation;
  readonly policy: DerivedPlaybackPolicy;
  readonly timeSec: number;
}): boolean {
  const endSec = timeSec + lookaheadSeconds;
  const batchesToQueue = Math.min(
    policy.prefetchBatchesPerPass,
    Math.ceil(lookaheadSeconds / policy.prefetchBatchSeconds),
  );
  let queued = false;
  for (let index = 0; index < batchesToQueue; index++) {
    const missing = collectMissingTicks(
      timeSec,
      endSec,
      policy.maxPrefetchBatch,
    );
    if (missing.length === 0) return queued;
    if (!fetchBatch(missing, activeStreams, operation)) {
      return queued;
    }
    queued = true;
  }
  return queued;
}

/** Queues the missing portion of the first-play startup window. */
export function fillMissingStartupBufferFrom({
  activeStreams,
  collectMissingTicks,
  fetchBatch,
  policy,
  timeSec,
}: {
  readonly activeStreams: string[];
  readonly collectMissingTicks: (
    startSec: number,
    endSec: number,
    maxTicks: number,
  ) => bigint[];
  readonly fetchBatch: (
    ticks: bigint[],
    activeStreams: string[],
    operation: DataOperation,
  ) => boolean;
  readonly policy: DerivedPlaybackPolicy;
  readonly timeSec: number;
}): boolean {
  const endSec = timeSec + policy.startupLookaheadSeconds;
  const missing = collectMissingTicks(
    timeSec,
    endSec,
    policy.startupMaxPrefetchBatch,
  );
  if (missing.length === 0) return false;
  return fetchBatch(missing, activeStreams, "startup-lookahead");
}

/**
 * Caps speculative ticks by the MCAP chunk curve already loaded with the
 * timeline. The first intersecting chunk is always admitted: it is the
 * synchronization boundary for the requested interval and can legitimately
 * exceed the byte budget by itself. Later chunks must fit both hard budgets.
 *
 * Sources without a byte curve cannot support an indexed byte-admission bound,
 * so they retain the existing time/tick window. Indexed MCAP sources receive
 * time, chunk-count, and compressed-chunk-byte admission bounds. Physical
 * Range transfer can be wider because the reader may fill aligned blocks; the
 * cleanroom Range ledger remains the authority for that separate plateau.
 */
export function boundSpeculativeTicksByByteTimeline({
  anchorTimeNs,
  byteTimeline,
  maxBytes,
  maxChunks,
  ticks,
}: {
  readonly anchorTimeNs: bigint;
  readonly byteTimeline: readonly ByteTimelinePoint[] | null;
  readonly maxBytes: number;
  readonly maxChunks: number;
  readonly ticks: readonly bigint[];
}): bigint[] {
  if (
    ticks.length === 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    !Number.isSafeInteger(maxChunks) ||
    maxChunks <= 0
  ) {
    return [];
  }
  if (!byteTimeline || byteTimeline.length === 0) {
    return [...ticks];
  }

  const firstEligibleChunk = lowerBoundByteTimeline(byteTimeline, anchorTimeNs);
  if (firstEligibleChunk >= byteTimeline.length) {
    return [];
  }
  const lastEligibleChunk = lastChunkWithinSpeculativeBudget({
    byteTimeline,
    firstEligibleChunk,
    maxBytes,
    maxChunks,
  });
  const endTimeNs = byteTimeline[lastEligibleChunk].endTimeNs;
  return ticks.filter((tick) => tick >= anchorTimeNs && tick <= endTimeNs);
}

function lastChunkWithinSpeculativeBudget({
  byteTimeline,
  firstEligibleChunk,
  maxBytes,
  maxChunks,
}: {
  readonly byteTimeline: readonly ByteTimelinePoint[];
  readonly firstEligibleChunk: number;
  readonly maxBytes: number;
  readonly maxChunks: number;
}): number {
  const bytesBeforeFirst =
    byteTimeline[firstEligibleChunk - 1]?.cumulativeCompressedBytes ?? 0;
  let lastEligibleChunk = firstEligibleChunk;
  for (
    let chunkIndex = firstEligibleChunk + 1;
    chunkIndex < byteTimeline.length;
    chunkIndex += 1
  ) {
    const chunkCount = chunkIndex - firstEligibleChunk + 1;
    const compressedBytes =
      byteTimeline[chunkIndex].cumulativeCompressedBytes - bytesBeforeFirst;
    if (chunkCount > maxChunks || compressedBytes > maxBytes) {
      break;
    }
    lastEligibleChunk = chunkIndex;
  }
  return lastEligibleChunk;
}

function lowerBoundByteTimeline(
  byteTimeline: readonly ByteTimelinePoint[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = byteTimeline.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (byteTimeline[middle].endTimeNs < timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clears episode-owned playback buffering feedback during source transitions. */
export function resetPlaybackBuffering(store: PlaybackStore): void {
  setBufferingDetail(store, null);
  setBufferingStreams(store, []);
  setIsBuffering(store, false);
  setBufferedRanges(store, []);
}

/** Counts cached timeline ticks across active streams in a bounded window. */
export function bufferWindowCoverage({
  activeStreams,
  caches,
  index,
  lookaheadSeconds,
  maxTicks,
  timeSec,
}: {
  readonly activeStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly index: TimelineIndex | null;
  readonly lookaheadSeconds: number;
  readonly maxTicks: number;
  readonly timeSec: number;
}): { readonly covered: number; readonly total: number } | null {
  if (!index || activeStreams.length === 0) return null;
  const startTick = index.nearestTick(timeSec);
  if (startTick === undefined) return null;
  const startIndex = index.indexOfTick(startTick);
  if (startIndex === undefined) return null;

  const endNs = index.secToNs(timeSec + lookaheadSeconds);
  let covered = 0;
  let total = 0;
  for (
    let indexPosition = startIndex;
    indexPosition < index.tickCount && total < maxTicks;
    indexPosition++
  ) {
    const tick = index.tickAt(indexPosition);
    if (tick === undefined || tick > endNs) break;
    total += 1;
    if (activeStreams.every((stream) => caches.get(stream)?.has(tick))) {
      covered += 1;
    }
  }
  return { covered, total };
}

/** Measures contiguous all-stream coverage beginning at the playhead. */
export function contiguousBufferedSecondsFromPlayhead({
  activeStreams,
  caches,
  index,
  maxSeconds,
  timeSec,
}: {
  readonly activeStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly index: TimelineIndex | null;
  readonly maxSeconds: number;
  readonly timeSec: number;
}): number {
  if (!index || activeStreams.length === 0 || maxSeconds <= 0) return 0;
  const startTick = index.nearestTick(timeSec);
  if (startTick === undefined) return 0;
  const startIndex = index.indexOfTick(startTick);
  if (startIndex === undefined) return 0;

  const endNs = index.secToNs(timeSec + maxSeconds);
  const nominalTickSec = index.tickDurationSec;
  let lastCoveredTick: bigint | null = null;
  for (
    let indexPosition = startIndex;
    indexPosition < index.tickCount;
    indexPosition++
  ) {
    const tick = index.tickAt(indexPosition);
    if (tick === undefined || tick > endNs) break;
    if (!activeStreams.every((stream) => caches.get(stream)?.has(tick))) break;
    lastCoveredTick = tick;
  }
  if (lastCoveredTick === null) return 0;
  return Math.min(
    maxSeconds,
    Math.max(0, index.nsToSec(lastCoveredTick) - timeSec + nominalTickSec),
  );
}

/** Filters stream ids to caches that currently have subscribers. */
export function activeStreamsInCaches(
  caches: Map<string, EpisodeStreamCache>,
  streams: readonly string[],
): string[] {
  return streams.filter((stream) => caches.get(stream)?.isActive);
}

/** Returns media age only after it crosses the configured stale threshold. */
export function staleAgeForMessage(
  tick: bigint,
  message: DecodedFrame,
  staleMediaWarningNs: bigint,
): bigint | null {
  if (staleMediaWarningNs <= 0n) return null;
  const ageNs = tick >= message.timestampNs ? tick - message.timestampNs : 0n;
  return ageNs > staleMediaWarningNs ? ageNs : null;
}

/** Seeds every requested stream cache from one synchronized frame window. */
export function distributeWindowToCaches(
  window: SynchronizedFrameWindow,
  caches: Map<string, EpisodeStreamCache>,
  requestedStreams: readonly string[],
): void {
  for (const stream of requestedStreams) {
    const messages = window.framesByStream[stream];
    caches.get(stream)?.set(window.timeNs, messages?.[0] ?? null);
  }
}

/** Aggregated decode diagnostics and affected ticks for one stream. */
export interface StreamWindowDecodeFailure {
  readonly messages: readonly string[];
  readonly ticks: readonly bigint[];
}

/** Groups synchronized-window decode diagnostics by stream. */
export function decodeFailuresByStream(
  windows: readonly SynchronizedFrameWindow[],
): ReadonlyMap<string, StreamWindowDecodeFailure> {
  const messagesByStream = new Map<string, Set<string>>();
  const ticksByStream = new Map<string, bigint[]>();
  for (const window of windows) {
    for (const [stream, diagnostics] of Object.entries(
      window.diagnosticsByStream ?? {},
    )) {
      const messages = messagesByStream.get(stream) ?? new Set<string>();
      for (const diagnostic of diagnostics) messages.add(diagnostic.message);
      messagesByStream.set(stream, messages);
      const ticks = ticksByStream.get(stream) ?? [];
      ticks.push(window.timeNs);
      ticksByStream.set(stream, ticks);
    }
  }
  return new Map(
    [...messagesByStream].map(([stream, messages]) => [
      stream,
      { messages: [...messages], ticks: ticksByStream.get(stream) ?? [] },
    ]),
  );
}

/** Compares playback buffer ranges by value. */
export function bufferedRangesEqual(
  left: ReadonlyArray<readonly [number, number]>,
  right: ReadonlyArray<readonly [number, number]>,
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (
      left[index][0] !== right[index][0] ||
      left[index][1] !== right[index][1]
    ) {
      return false;
    }
  }
  return true;
}

/** Derives contiguous all-stream cache coverage for timeline shading. */
export function computeBufferedRanges({
  activeStreams,
  caches,
  index,
}: {
  readonly activeStreams: readonly string[];
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly index: TimelineIndex | null;
}): Array<[number, number]> {
  if (!index || activeStreams.length === 0) return [];
  const firstCache = caches.get(activeStreams[0]);
  if (!firstCache) return [];

  // Each cache maintains compressed sorted intervals as placements change.
  // Intersecting those intervals is O(streams * retained islands), independent
  // of recording duration and of the length of one contiguous warm history.
  let ranges = [...firstCache.cachedTickIndexRanges(index)];
  for (const stream of activeStreams.slice(1)) {
    const cache = caches.get(stream);
    if (!cache) return [];
    ranges = intersectTickRanges(ranges, cache.cachedTickIndexRanges(index));
    if (ranges.length === 0) return [];
  }

  const bufferedRanges: Array<[number, number]> = [];
  const nominalTickSec = index.tickDurationSec;
  const pushRange = (startIndex: number, endIndex: number): void => {
    const startTick = index.tickAt(startIndex);
    const endTick = index.tickAt(endIndex);
    if (startTick === undefined || endTick === undefined) return;
    bufferedRanges.push([
      index.nsToSec(startTick),
      Math.min(index.nsToSec(endTick) + nominalTickSec, index.durationSec),
    ]);
  };
  for (const range of ranges) pushRange(range.startIndex, range.endIndex);
  return bufferedRanges;
}

