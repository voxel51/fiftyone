import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteReadDebugLog,
} from "../query/bytes";
import { monotonicNowMs } from "../time";

/**
 * Cumulative network-transport counters for one reader context. Values only
 * grow; consumers diff consecutive snapshots from the same source of samples.
 */
export interface NetworkTransportSnapshot {
  /**
   * Wall milliseconds with at least one network fetch in flight.
   */
  readonly busyMs: number;

  /**
   * Monotonic timestamp when the snapshot was taken.
   */
  readonly capturedAtMs: number;

  /**
   * Bytes actually fetched over the network. Cache hits are excluded.
   */
  readonly fetchedBytes: number;

  /**
   * Completed network fetches. Cache hits and coalesced reads are excluded.
   */
  readonly reads: number;
}

/** Shared scheduling lane used by source transport telemetry. */
export type TransportLane = "foreground" | "idle" | "bulk";

/** One lane's cumulative source-transport counters. */
export interface LaneTransportSnapshot {
  readonly lane: TransportLane;
  readonly snapshot: NetworkTransportSnapshot;
}

export interface NetworkTransportMeter {
  onByteRead(entry: ByteReadDebugLog): void;
  snapshot(): NetworkTransportSnapshot;
}

/**
 * Aggregates byte-read completions into link-usage counters.
 *
 * Busy time is the union of fetch intervals, reconstructed from completion
 * events. Concurrent fetches therefore count wall time once, matching the
 * question "was the link busy?" rather than summing parallel request time.
 */
export function createNetworkTransportMeter(
  now: () => number = monotonicNowMs,
): NetworkTransportMeter {
  let busyMs = 0;
  const busyIntervals: Array<{ endMs: number; startMs: number }> = [];
  let fetchedBytes = 0;
  let reads = 0;

  return {
    onByteRead(entry) {
      if (
        entry.cacheResult !== "fetched" ||
        entry.readProfile === BYTE_SOURCE_READ_PROFILE.LOCAL
      ) {
        return;
      }

      const endMs = now();
      const startMs = endMs - Math.max(0, entry.durationMs);
      busyMs += mergeBusyInterval(busyIntervals, { endMs, startMs });
      fetchedBytes += Math.max(0, entry.fetchedBytes);
      reads += 1;
    },

    snapshot() {
      return {
        busyMs,
        capturedAtMs: now(),
        fetchedBytes,
        reads,
      };
    },
  };
}

// Completion timestamps are non-decreasing because the production clock is
// monotonic; the suffix-only scan and incremental union accounting rely on it.
function mergeBusyInterval(
  intervals: Array<{ endMs: number; startMs: number }>,
  next: { readonly endMs: number; readonly startMs: number },
): number {
  let firstMergedIndex = intervals.length;
  let mergedStartMs = next.startMs;
  let mergedEndMs = next.endMs;
  let overlapMs = 0;

  while (firstMergedIndex > 0) {
    const previous = intervals[firstMergedIndex - 1];
    if (previous.endMs < mergedStartMs) break;
    firstMergedIndex -= 1;
    overlapMs += Math.max(
      0,
      Math.min(previous.endMs, next.endMs) -
        Math.max(previous.startMs, next.startMs),
    );
    mergedStartMs = Math.min(mergedStartMs, previous.startMs);
    mergedEndMs = Math.max(mergedEndMs, previous.endMs);
  }

  const nextLengthMs = Math.max(0, next.endMs - next.startMs);
  const merged = { endMs: mergedEndMs, startMs: mergedStartMs };
  if (firstMergedIndex === intervals.length) intervals.push(merged);
  else intervals.splice(firstMergedIndex, intervals.length, merged);
  return Math.max(0, nextLengthMs - overlapMs);
}
