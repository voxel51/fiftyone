import {
  getLoopEnd,
  getLoopStart,
  getPlayhead,
  type PlaybackStore,
} from "@fiftyone/playback";

import type { DecodedFrame } from "../../../ir";
import {
  intersectAllTickRanges,
  intersectTickRanges,
  normalizeTickRanges,
  subtractTickRanges,
  unionAllTickRanges,
  type EpisodeStreamCache,
  type EpisodeStreamCachePruneResult,
  type EpisodeStreamCacheStats,
  type EpisodeStreamCacheTickRange,
  type TimelineIndex,
} from "../../../runtime";
import { playbackLookaheadSegments } from "./playback-buffering";

const BYTES_PER_GIBIBYTE = 1024 ** 3;
const DEFAULT_DECODED_CACHE_BUDGET_BYTES = 256 * 1024 ** 2;
const MIN_DECODED_CACHE_BUDGET_BYTES = 128 * 1024 ** 2;
const MAX_DECODED_CACHE_BUDGET_BYTES = 512 * 1024 ** 2;
const RECOVERY_THRESHOLD = 0.6;
const HISTORY_EVICTION_BATCH_SECONDS = 0.25;

/**
 * Reserves roughly 1/32 of reported device memory for playback's decoded
 * stream caches. Unknown-memory browsers use a middle-of-the-road budget.
 */
export function decodedCacheBudgetBytes(memoryGb: number | null): number {
  if (memoryGb === null || !Number.isFinite(memoryGb) || memoryGb <= 0) {
    return DEFAULT_DECODED_CACHE_BUDGET_BYTES;
  }

  return clamp(
    Math.floor((memoryGb * BYTES_PER_GIBIBYTE) / 32),
    MIN_DECODED_CACHE_BUDGET_BYTES,
    MAX_DECODED_CACHE_BUDGET_BYTES,
  );
}

/**
 * Shrinks speculative lookahead proportionally when decoded retention exceeds
 * its budget, but never below the startup runway. Recovery is deliberately
 * gradual and hysteretic so one large frame cannot make the horizon flap.
 */
export function nextDecodedCacheLookaheadSeconds({
  budgetBytes,
  currentSeconds,
  decodedBytes,
  maxEntries = Number.MAX_SAFE_INTEGER,
  maxSeconds,
  minSeconds,
  retainedEntries = 0,
  stepSeconds,
}: {
  readonly budgetBytes: number;
  readonly currentSeconds: number;
  readonly decodedBytes: number;
  readonly maxEntries?: number;
  readonly maxSeconds: number;
  readonly minSeconds: number;
  readonly retainedEntries?: number;
  readonly stepSeconds: number;
}): number {
  const effectiveStepSeconds = effectiveLookaheadStepSeconds({
    currentSeconds,
    maxSeconds,
    minSeconds,
    stepSeconds,
  });
  const bytePressure = pressureRatio(decodedBytes, budgetBytes);
  const placementPressure = pressureRatio(retainedEntries, maxEntries);
  const pressure = Math.max(bytePressure, placementPressure);
  if (pressure > 1) {
    const scaledSeconds = currentSeconds / pressure;
    const steppedSeconds =
      Math.floor(scaledSeconds / effectiveStepSeconds) * effectiveStepSeconds;
    return clamp(steppedSeconds, minSeconds, currentSeconds);
  }

  if (
    bytePressure <= RECOVERY_THRESHOLD &&
    placementPressure <= RECOVERY_THRESHOLD &&
    currentSeconds < maxSeconds
  ) {
    return Math.min(maxSeconds, currentSeconds + effectiveStepSeconds);
  }

  return currentSeconds;
}

/** Rebalances decoded caches and returns the next speculative horizon. */
export function rebalanceDecodedCaches({
  activeStreams,
  blockingStreams,
  budgetBytes,
  caches,
  currentLookaheadSeconds,
  index,
  maxLookaheadSeconds,
  minLookaheadSeconds,
  placementCeiling = Number.MAX_SAFE_INTEGER,
  stepSeconds,
  store,
}: {
  readonly activeStreams?: readonly string[];
  readonly blockingStreams?: readonly string[];
  readonly budgetBytes: number;
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly currentLookaheadSeconds: number;
  readonly index: TimelineIndex | null;
  readonly maxLookaheadSeconds: number;
  readonly minLookaheadSeconds: number;
  readonly placementCeiling?: number;
  readonly stepSeconds: number;
  readonly store: PlaybackStore;
}): number {
  if (!index) return currentLookaheadSeconds;

  const activeCacheEntries = selectCacheEntries(caches, activeStreams);
  if (activeCacheEntries.length === 0) return currentLookaheadSeconds;
  const activeCaches = activeCacheEntries.map(([, cache]) => cache);
  for (const cache of activeCaches) cache.configureTimeline(index);
  const effectiveStepSeconds = effectiveLookaheadStepSeconds({
    currentSeconds: currentLookaheadSeconds,
    maxSeconds: maxLookaheadSeconds,
    minSeconds: minLookaheadSeconds,
    stepSeconds,
  });

  const blockingCacheEntries = selectBlockingCacheEntries(
    activeCacheEntries,
    blockingStreams,
  );

  const playheadSec = getPlayhead(store);
  const loopStartSec = getLoopStart(store);
  const loopEndSec = getLoopEnd(store);
  const isInsideActiveLoop =
    loopEndSec > loopStartSec &&
    playheadSec >= loopStartSec &&
    playheadSec <= loopEndSec;
  const currentTick = index.nearestTick(
    Math.min(index.durationSec, Math.max(0, playheadSec)),
  );
  const currentIndex =
    currentTick === undefined ? undefined : index.indexOfTick(currentTick);
  if (currentIndex === undefined) return currentLookaheadSeconds;

  const currentForwardRanges = forwardTickRanges({
    index,
    lookaheadSeconds: currentLookaheadSeconds,
    loopEndSec,
    loopStartSec,
    playheadSec,
  });
  const currentForwardStats = aggregateRangeStats(
    activeCaches,
    currentForwardRanges,
    index,
  );

  // Recovery is based only on the time-bounded forward tier. Retained history
  // can consume the residual budget without pinning a formerly-constrained
  // horizon at its minimum forever.
  let nextLookaheadSeconds = currentLookaheadSeconds;
  if (!isUnderPressure(currentForwardStats, budgetBytes, placementCeiling)) {
    nextLookaheadSeconds = nextDecodedCacheLookaheadSeconds({
      budgetBytes,
      currentSeconds: currentLookaheadSeconds,
      decodedBytes: currentForwardStats.accountedBytes,
      maxEntries: placementCeiling,
      maxSeconds: maxLookaheadSeconds,
      minSeconds: minLookaheadSeconds,
      retainedEntries: currentForwardStats.entryCount,
      stepSeconds: effectiveStepSeconds,
    });
  }

  let forwardRanges = forwardTickRanges({
    index,
    lookaheadSeconds: nextLookaheadSeconds,
    loopEndSec,
    loopStartSec,
    playheadSec,
  });
  // The per-cache totals may conservatively double-count a decoded object
  // shared across stream caches. When even that upper bound fits, avoid an
  // O(unique decoded frames) identity scan on the ordinary no-pressure path.
  const rawTotals = activeCaches.reduce(
    (totals, cache) => addStats(totals, cache.stats()),
    emptyStats(),
  );
  if (!isUnderPressure(rawTotals, budgetBytes, placementCeiling)) {
    return nextLookaheadSeconds;
  }
  const accounting = createCacheAccounting(activeCaches);
  if (!isUnderPressure(accounting.totals, budgetBytes, placementCeiling)) {
    return nextLookaheadSeconds;
  }

  const commonCoverage = intersectAllTickRanges(
    blockingCacheEntries.map(([, cache]) => cache.cachedTickIndexRanges(index)),
  );
  const loopDomain = isInsideActiveLoop
    ? tickRangeForSeconds(index, loopStartSec, loopEndSec)
    : null;
  const historySegmentsNewestFirst = contiguousHistorySegments({
    commonCoverage,
    currentIndex,
    domain: loopDomain ?? { endIndex: index.tickCount - 1, startIndex: 0 },
    wraps: loopDomain !== null,
  });
  const historyRanges = normalizeTickRanges(historySegmentsNewestFirst);

  // First remove stale islands from old seeks. Whole islands are coordinated
  // by time across every active cache, so no stream-specific LRU fringe is
  // left behind to make the all-blocking intersection ragged.
  const allCoverage = unionAllTickRanges(
    activeCaches.map((cache) => cache.cachedTickIndexRanges(index)),
  );
  const staleIslands = subtractTickRanges(
    allCoverage,
    normalizeTickRanges([...forwardRanges, ...historyRanges]),
  ).sort(
    (left, right) =>
      staleIslandDistance(right, currentIndex, loopDomain) -
      staleIslandDistance(left, currentIndex, loopDomain),
  );
  for (const island of staleIslands) {
    pruneCachesInRanges(activeCaches, [island], index, accounting);
    if (!isUnderPressure(accounting.totals, budgetBytes, placementCeiling)) {
      return nextLookaheadSeconds;
    }
  }

  // Then advance one shared oldest-history boundary. Small time batches bound
  // synchronous work/over-eviction while preserving the recent edge and the
  // cross-stream intersection. A full loop remains warm when it fits; its tail
  // becomes cyclic history rather than a mandatory cold seam.
  const evictionBatchTicks = Math.max(
    1,
    Math.ceil(index.tickRateHz * HISTORY_EVICTION_BATCH_SECONDS),
  );
  const historyEvictionRanges = [...historySegmentsNewestFirst]
    .reverse()
    .flatMap((segment) => subtractTickRanges([segment], forwardRanges));
  // Each segment is already oldest-to-newest in playback order. For a wrapped
  // tail that means lower indexes are older (for example, 17 predates 20 when
  // the playhead has wrapped to 12), so batches deliberately advance upward.
  for (const range of historyEvictionRanges) {
    for (
      let startIndex = range.startIndex;
      startIndex <= range.endIndex;
      startIndex += evictionBatchTicks
    ) {
      pruneCachesInRanges(
        activeCaches,
        [
          {
            endIndex: Math.min(
              range.endIndex,
              startIndex + evictionBatchTicks - 1,
            ),
            startIndex,
          },
        ],
        index,
        accounting,
      );
      if (!isUnderPressure(accounting.totals, budgetBytes, placementCeiling)) {
        return nextLookaheadSeconds;
      }
    }
  }

  // Only protected/forward placements remain. Shrink the speculative part in
  // bounded steps, never crossing the minimum startup/current-tick runway.
  while (
    isUnderPressure(accounting.totals, budgetBytes, placementCeiling) &&
    nextLookaheadSeconds > minLookaheadSeconds
  ) {
    const forwardStats = aggregateRangeStats(
      activeCaches,
      forwardRanges,
      index,
    );
    const proposed = nextDecodedCacheLookaheadSeconds({
      budgetBytes,
      currentSeconds: nextLookaheadSeconds,
      decodedBytes: forwardStats.accountedBytes,
      maxEntries: placementCeiling,
      maxSeconds: maxLookaheadSeconds,
      minSeconds: minLookaheadSeconds,
      retainedEntries: forwardStats.entryCount,
      stepSeconds: effectiveStepSeconds,
    });
    nextLookaheadSeconds =
      proposed < nextLookaheadSeconds
        ? proposed
        : Math.max(
            minLookaheadSeconds,
            nextLookaheadSeconds - effectiveStepSeconds,
          );
    const nextForwardRanges = forwardTickRanges({
      index,
      lookaheadSeconds: nextLookaheadSeconds,
      loopEndSec,
      loopStartSec,
      playheadSec,
    });
    const speculative = subtractTickRanges(forwardRanges, nextForwardRanges);
    pruneCachesInRanges(activeCaches, speculative, index, accounting);
    forwardRanges = nextForwardRanges;
  }

  // If the minimum/current runway alone exceeds the heuristic byte budget,
  // keep it: playback correctness wins. The wide placement ceiling remains a
  // defense-in-depth bound; there is intentionally no fictitious browser
  // memory-pressure callback here.
  return nextLookaheadSeconds;
}

/** Browser-reported device memory, normalized for cache-budget decisions. */
export function reportedDeviceMemoryGb(): number | null {
  if (typeof navigator === "undefined") return null;
  const memoryGb = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return memoryGb !== undefined && Number.isFinite(memoryGb) && memoryGb > 0
    ? memoryGb
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function effectiveLookaheadStepSeconds({
  currentSeconds,
  maxSeconds,
  minSeconds,
  stepSeconds,
}: {
  readonly currentSeconds: number;
  readonly maxSeconds: number;
  readonly minSeconds: number;
  readonly stepSeconds: number;
}): number {
  if (Number.isFinite(stepSeconds) && stepSeconds > 0) return stepSeconds;
  return Math.max(
    Number.EPSILON,
    currentSeconds - minSeconds,
    maxSeconds - minSeconds,
  );
}

function pressureRatio(value: number, limit: number): number {
  if (value <= 0) return 0;
  if (!Number.isFinite(limit) || limit >= Number.MAX_SAFE_INTEGER) return 0;
  if (limit <= 0) return Number.POSITIVE_INFINITY;
  return value / limit;
}

function selectCacheEntries(
  caches: Map<string, EpisodeStreamCache>,
  streams: readonly string[] | undefined,
): Array<[string, EpisodeStreamCache]> {
  if (streams === undefined) return [...caches.entries()];
  return streams.flatMap((stream) => {
    const cache = caches.get(stream);
    return cache ? [[stream, cache] as [string, EpisodeStreamCache]] : [];
  });
}

function selectBlockingCacheEntries(
  activeEntries: readonly [string, EpisodeStreamCache][],
  blockingStreams: readonly string[] | undefined,
): Array<[string, EpisodeStreamCache]> {
  if (!blockingStreams || blockingStreams.length === 0) {
    return [...activeEntries];
  }
  const blocking = new Set(blockingStreams);
  const selected = activeEntries.filter(([stream]) => blocking.has(stream));
  return selected.length > 0 ? selected : [...activeEntries];
}

function emptyStats(): EpisodeStreamCacheStats {
  return {
    accountedBytes: 0,
    decodedBytes: 0,
    entryCount: 0,
    messageMetadataBytes: 0,
    placementBytes: 0,
  };
}

function addStats(
  totals: EpisodeStreamCacheStats,
  stats: EpisodeStreamCacheStats,
): EpisodeStreamCacheStats {
  return {
    accountedBytes: totals.accountedBytes + stats.accountedBytes,
    decodedBytes: totals.decodedBytes + stats.decodedBytes,
    entryCount: totals.entryCount + stats.entryCount,
    messageMetadataBytes:
      totals.messageMetadataBytes + stats.messageMetadataBytes,
    placementBytes: totals.placementBytes + stats.placementBytes,
  };
}

interface MessageOwners {
  readonly decodedBytes: number;
  owners: number;
}

interface CacheAccounting {
  readonly messageOwners: Map<DecodedFrame, MessageOwners>;
  totals: EpisodeStreamCacheStats;
}

function createCacheAccounting(
  caches: readonly EpisodeStreamCache[],
): CacheAccounting {
  const messageOwners = new Map<DecodedFrame, MessageOwners>();
  let entryCount = 0;
  let messageMetadataBytes = 0;
  let placementBytes = 0;
  for (const cache of caches) {
    const stats = cache.stats();
    entryCount += stats.entryCount;
    messageMetadataBytes += stats.messageMetadataBytes;
    placementBytes += stats.placementBytes;
    cache.forEachRetainedMessage((message, decodedBytes) => {
      const retained = messageOwners.get(message);
      if (retained) retained.owners += 1;
      else messageOwners.set(message, { decodedBytes, owners: 1 });
    });
  }
  const decodedBytes = [...messageOwners.values()].reduce(
    (bytes, retained) => bytes + retained.decodedBytes,
    0,
  );
  return {
    messageOwners,
    totals: {
      accountedBytes: decodedBytes + messageMetadataBytes + placementBytes,
      decodedBytes,
      entryCount,
      messageMetadataBytes,
      placementBytes,
    },
  };
}

function aggregateRangeStats(
  caches: readonly EpisodeStreamCache[],
  ranges: readonly EpisodeStreamCacheTickRange[],
  index: TimelineIndex,
): EpisodeStreamCacheStats {
  const seenMessages = new Set<DecodedFrame>();
  let totals = emptyStats();
  for (const cache of caches) {
    totals = addStats(
      totals,
      cache.memoryStatsForTickIndexRanges(ranges, index, seenMessages),
    );
  }
  return totals;
}

function isUnderPressure(
  stats: Pick<EpisodeStreamCacheStats, "accountedBytes" | "entryCount">,
  budgetBytes: number,
  placementCeiling: number,
): boolean {
  return (
    stats.accountedBytes > Math.max(0, budgetBytes) ||
    stats.entryCount > Math.max(0, placementCeiling)
  );
}

function forwardTickRanges({
  index,
  lookaheadSeconds,
  loopEndSec,
  loopStartSec,
  playheadSec,
}: {
  readonly index: TimelineIndex;
  readonly lookaheadSeconds: number;
  readonly loopEndSec: number;
  readonly loopStartSec: number;
  readonly playheadSec: number;
}): EpisodeStreamCacheTickRange[] {
  const segments = playbackLookaheadSegments({
    durationSec: index.durationSec,
    lookaheadSeconds,
    loopEndSec,
    loopStartSec,
    timeSec: playheadSec,
  });
  const ranges = segments.flatMap(({ endSec, startSec }) => {
    const range = tickRangeForSeconds(index, startSec, endSec);
    return range ? [range] : [];
  });
  if (ranges.length > 0) return normalizeTickRanges(ranges);
  const currentTick = index.nearestTick(
    Math.min(index.durationSec, Math.max(0, playheadSec)),
  );
  const currentIndex =
    currentTick === undefined ? undefined : index.indexOfTick(currentTick);
  return currentIndex === undefined
    ? []
    : [{ endIndex: currentIndex, startIndex: currentIndex }];
}

function tickRangeForSeconds(
  index: TimelineIndex,
  startSec: number,
  endSec: number,
): EpisodeStreamCacheTickRange | null {
  const startTick = index.nearestTick(startSec);
  const endTick = index.nearestTick(endSec);
  const startIndex =
    startTick === undefined ? undefined : index.indexOfTick(startTick);
  const endIndex =
    endTick === undefined ? undefined : index.indexOfTick(endTick);
  if (startIndex === undefined || endIndex === undefined) return null;
  return {
    endIndex: Math.max(startIndex, endIndex),
    startIndex: Math.min(startIndex, endIndex),
  };
}

function contiguousHistorySegments({
  commonCoverage,
  currentIndex,
  domain,
  wraps,
}: {
  readonly commonCoverage: readonly EpisodeStreamCacheTickRange[];
  readonly currentIndex: number;
  readonly domain: EpisodeStreamCacheTickRange;
  readonly wraps: boolean;
}): EpisodeStreamCacheTickRange[] {
  const clipped = intersectTickRanges(commonCoverage, [domain]);
  const adjacentIndex = Math.max(domain.startIndex, currentIndex - 1);
  const currentRange = clipped.find(
    (range) =>
      (currentIndex >= range.startIndex && currentIndex <= range.endIndex) ||
      (adjacentIndex >= range.startIndex && adjacentIndex <= range.endIndex),
  );
  const atLoopStart = wraps && currentIndex === domain.startIndex;
  if ((!currentRange || currentIndex <= domain.startIndex) && !atLoopStart) {
    return [];
  }

  const segments: EpisodeStreamCacheTickRange[] = [];
  if (currentRange && currentIndex > currentRange.startIndex) {
    segments.push({
      endIndex: Math.min(currentRange.endIndex, currentIndex - 1),
      startIndex: currentRange.startIndex,
    });
  }
  if (!wraps || currentRange?.startIndex !== domain.startIndex) return segments;

  const tail = clipped[clipped.length - 1];
  if (!tail || tail.endIndex !== domain.endIndex) return segments;
  const tailStart = Math.max(tail.startIndex, currentIndex + 1);
  if (tailStart <= tail.endIndex) {
    segments.push({ endIndex: tail.endIndex, startIndex: tailStart });
  }
  return segments;
}

function pruneCachesInRanges(
  caches: readonly EpisodeStreamCache[],
  ranges: readonly EpisodeStreamCacheTickRange[],
  index: TimelineIndex,
  accounting: CacheAccounting,
): void {
  if (ranges.length === 0) return;
  for (const cache of caches) {
    const before = cache.stats();
    const result = cache.pruneTickIndexRangesWithStats(ranges, index);
    if (result.removedEntries === 0) continue;
    const after = cache.stats();
    applyPruneToAccounting(accounting, result, before, after);
  }
}

function applyPruneToAccounting(
  accounting: CacheAccounting,
  result: EpisodeStreamCachePruneResult,
  before: EpisodeStreamCacheStats,
  after: EpisodeStreamCacheStats,
): void {
  let releasedDecodedBytes = 0;
  for (const released of result.releasedMessages) {
    const owners = accounting.messageOwners.get(released.message);
    if (!owners) continue;
    owners.owners -= 1;
    if (owners.owners > 0) continue;
    releasedDecodedBytes += owners.decodedBytes;
    accounting.messageOwners.delete(released.message);
  }

  const decodedBytes = Math.max(
    0,
    accounting.totals.decodedBytes - releasedDecodedBytes,
  );
  const entryCount = Math.max(
    0,
    accounting.totals.entryCount - result.removedEntries,
  );
  const messageMetadataBytes = Math.max(
    0,
    accounting.totals.messageMetadataBytes -
      (before.messageMetadataBytes - after.messageMetadataBytes),
  );
  const placementBytes = Math.max(
    0,
    accounting.totals.placementBytes -
      (before.placementBytes - after.placementBytes),
  );
  accounting.totals = {
    accountedBytes: decodedBytes + messageMetadataBytes + placementBytes,
    decodedBytes,
    entryCount,
    messageMetadataBytes,
    placementBytes,
  };
}

function staleIslandDistance(
  range: EpisodeStreamCacheTickRange,
  currentIndex: number,
  loopDomain: EpisodeStreamCacheTickRange | null,
): number {
  if (
    loopDomain &&
    (range.endIndex < loopDomain.startIndex ||
      range.startIndex > loopDomain.endIndex)
  ) {
    return (
      loopDomain.endIndex -
      loopDomain.startIndex +
      Math.min(
        Math.abs(range.startIndex - currentIndex),
        Math.abs(range.endIndex - currentIndex),
      )
    );
  }
  return Math.min(
    Math.abs(range.startIndex - currentIndex),
    Math.abs(range.endIndex - currentIndex),
  );
}
