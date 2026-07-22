const BYTES_PER_GIBIBYTE = 1024 ** 3;
const DEFAULT_DECODED_CACHE_BUDGET_BYTES = 256 * 1024 ** 2;
const MIN_DECODED_CACHE_BUDGET_BYTES = 128 * 1024 ** 2;
const MAX_DECODED_CACHE_BUDGET_BYTES = 512 * 1024 ** 2;
const RECOVERY_THRESHOLD = 0.6;

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
  maxSeconds,
  minSeconds,
  stepSeconds,
}: {
  readonly budgetBytes: number;
  readonly currentSeconds: number;
  readonly decodedBytes: number;
  readonly maxSeconds: number;
  readonly minSeconds: number;
  readonly stepSeconds: number;
}): number {
  if (decodedBytes > budgetBytes) {
    const scaledSeconds =
      (currentSeconds * Math.max(0, budgetBytes)) / decodedBytes;
    const steppedSeconds =
      Math.floor(scaledSeconds / stepSeconds) * stepSeconds;
    return clamp(steppedSeconds, minSeconds, currentSeconds);
  }

  if (
    decodedBytes <= budgetBytes * RECOVERY_THRESHOLD &&
    currentSeconds < maxSeconds
  ) {
    return Math.min(maxSeconds, currentSeconds + stepSeconds);
  }

  return currentSeconds;
}

/** Rebalances decoded caches and returns the next speculative horizon. */
export function rebalanceDecodedCaches({
  budgetBytes,
  caches,
  currentLookaheadSeconds,
  index,
  maxLookaheadSeconds,
  minLookaheadSeconds,
  pruneSpeculative,
  stepSeconds,
  store,
}: {
  readonly budgetBytes: number;
  readonly caches: Map<string, EpisodeStreamCache>;
  readonly currentLookaheadSeconds: number;
  readonly index: TimelineIndex | null;
  readonly maxLookaheadSeconds: number;
  readonly minLookaheadSeconds: number;
  readonly pruneSpeculative: boolean;
  readonly stepSeconds: number;
  readonly store: PlaybackStore;
}): number {
  if (!index) return currentLookaheadSeconds;

  let decodedBytes = 0;
  for (const cache of caches.values()) decodedBytes += cache.decodedBytes;
  const nextLookaheadSeconds = nextDecodedCacheLookaheadSeconds({
    budgetBytes,
    currentSeconds: currentLookaheadSeconds,
    decodedBytes,
    maxSeconds: maxLookaheadSeconds,
    minSeconds: minLookaheadSeconds,
    stepSeconds,
  });
  if (decodedBytes <= budgetBytes || !pruneSpeculative) {
    return nextLookaheadSeconds;
  }

  const playheadSec = getPlayhead(store);
  const protectedStartTick = index.nearestTick(
    Math.max(0, playheadSec - minLookaheadSeconds),
  );
  const protectedEndTick = index.nearestTick(
    Math.min(index.durationSec, playheadSec + nextLookaheadSeconds),
  );
  if (protectedStartTick === undefined || protectedEndTick === undefined) {
    return nextLookaheadSeconds;
  }
  for (const cache of caches.values()) {
    cache.pruneOutside(protectedStartTick, protectedEndTick);
  }
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
import { getPlayhead, type PlaybackStore } from "@fiftyone/playback";

import type { EpisodeStreamCache, TimelineIndex } from "../../../runtime";
