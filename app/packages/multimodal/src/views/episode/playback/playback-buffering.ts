import {
  setBufferedRanges,
  setBufferingDetail,
  setBufferingStreams,
  setIsBuffering,
  type PlaybackStore,
} from "@fiftyone/playback";
import type { DecodedFrame, SynchronizedFrameWindow } from "../../../ir";
import {
  DEFAULT_TIMELINE_TICK_RATE_HZ,
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
  readonly startupBufferSeconds: number;
  readonly startupMaxTicks: number;
  readonly startupMinTicks: number;
  readonly pausedWarmupRunwaySeconds: number;
  readonly prefetchBatchSeconds: number;
  readonly prefetchBatchesPerPass: number;
  readonly prefetchRefreshSeconds: number;
  readonly streamCacheLookaheadMultiplier: number;
}

/** Playback policy resolved into concrete timeline and cache limits. */
export interface DerivedPlaybackPolicy extends PlaybackPolicy {
  readonly maxPrefetchBatch: number;
  readonly startupLookaheadSeconds: number;
  readonly startupMaxPrefetchBatch: number;
  readonly streamCacheMaxEntries: number;
}

/** Longest pre-data gap that initial episode setup advances automatically. */
export const INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS = 0.5;

/** Default buffering policy for episode playback. */
export const DEFAULT_PLAYBACK_POLICY: PlaybackPolicy = {
  lookaheadSeconds: 4,
  pausedWarmupRunwaySeconds: 1.5,
  prefetchBatchSeconds: 1,
  prefetchBatchesPerPass: 1,
  prefetchRefreshSeconds: 0.5,
  startupBufferSeconds: INITIAL_DATA_AUTO_SEEK_THRESHOLD_SECONDS,
  startupMaxTicks: 15,
  startupMinTicks: 3,
  streamCacheLookaheadMultiplier: 2,
};

/** Resolves a playback policy against the active timeline tick rate. */
export function derivePlaybackPolicy(
  policy: PlaybackPolicy,
  tickRateHz = DEFAULT_TIMELINE_TICK_RATE_HZ,
): DerivedPlaybackPolicy {
  const startupLookaheadSeconds = clampNumber(
    policy.startupBufferSeconds,
    policy.startupMinTicks / tickRateHz,
    policy.startupMaxTicks / tickRateHz,
  );
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
    streamCacheMaxEntries: Math.ceil(
      tickRateHz *
        policy.lookaheadSeconds *
        policy.streamCacheLookaheadMultiplier,
    ),
  };
}

/** Maps scheduler operations onto the resource client's read priorities. */
export function batchReadPriority(
  operation: DataOperation,
): "idle" | "playback" {
  return operation === "background-lookahead" ? "idle" : "playback";
}

/** Queues bounded background batches for missing rolling lookahead. */
export function fillMissingLookaheadFrom({
  activeStreams,
  collectMissingTicks,
  fetchBatch,
  lookaheadSeconds,
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
    if (!fetchBatch(missing, activeStreams, "background-lookahead")) {
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
  const nominalTickSec = 1 / DEFAULT_TIMELINE_TICK_RATE_HZ;
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

/** Converts a non-negative nanosecond duration into seconds. */
export function nsToSeconds(deltaNs: bigint): number {
  const clamped = deltaNs < 0n ? 0n : deltaNs;
  return (
    Number(clamped / 1_000_000_000n) +
    Number(clamped % 1_000_000_000n) / 1_000_000_000
  );
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
  options?: { readonly pinned?: boolean },
): void {
  for (const stream of requestedStreams) {
    const messages = window.framesByStream[stream];
    caches.get(stream)?.set(window.timeNs, messages?.[0] ?? null, options);
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

  const indexes: number[] = [];
  const seenIndexes = new Set<number>();
  for (const tick of firstCache.cachedTicks()) {
    const tickIndex = index.indexOfTick(tick);
    if (tickIndex === undefined || seenIndexes.has(tickIndex)) continue;
    if (!activeStreams.every((stream) => caches.get(stream)?.has(tick))) {
      continue;
    }
    seenIndexes.add(tickIndex);
    indexes.push(tickIndex);
  }
  if (indexes.length === 0) return [];
  indexes.sort((left, right) => left - right);

  const ranges: Array<[number, number]> = [];
  const nominalTickSec = 1 / DEFAULT_TIMELINE_TICK_RATE_HZ;
  const pushRange = (startIndex: number, endIndex: number): void => {
    const startTick = index.tickAt(startIndex);
    const endTick = index.tickAt(endIndex);
    if (startTick === undefined || endTick === undefined) return;
    ranges.push([
      index.nsToSec(startTick),
      Math.min(index.nsToSec(endTick) + nominalTickSec, index.durationSec),
    ]);
  };

  let runStartIndex = indexes[0];
  let runEndIndex = runStartIndex;
  for (let position = 1; position < indexes.length; position++) {
    const nextIndex = indexes[position];
    if (nextIndex === runEndIndex + 1) {
      runEndIndex = nextIndex;
      continue;
    }
    pushRange(runStartIndex, runEndIndex);
    runStartIndex = nextIndex;
    runEndIndex = nextIndex;
  }
  pushRange(runStartIndex, runEndIndex);
  return ranges;
}
