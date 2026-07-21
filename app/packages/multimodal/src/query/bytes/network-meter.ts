import type {
  LaneTransportSnapshot,
  NetworkTransportSnapshot,
  TransportLane,
} from "../../ir";
import { monotonicNowMs } from "../../utils/monotonic-time";
import { BYTE_SOURCE_READ_PROFILE } from "./constants";
import type { ByteReadDebugLog } from "./types";

export type { LaneTransportSnapshot, NetworkTransportSnapshot, TransportLane };

/** Aggregates byte-read completions into cumulative network counters. */
export interface NetworkTransportMeter {
  onByteRead(entry: ByteReadDebugLog): void;
  snapshot(): NetworkTransportSnapshot;
}

/**
 * Measures fetched bytes and the union of network-busy intervals for one
 * reader context. Cache hits and local-file reads do not count as transport.
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
        entry.fetchedBytes <= 0 ||
        entry.readProfile === BYTE_SOURCE_READ_PROFILE.LOCAL
      ) {
        return;
      }

      const endMs = now();
      const startMs = endMs - Math.max(0, entry.durationMs);
      busyMs += mergeBusyInterval(busyIntervals, { endMs, startMs });
      fetchedBytes += entry.fetchedBytes;
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
  else
    intervals.splice(
      firstMergedIndex,
      intervals.length - firstMergedIndex,
      merged,
    );
  return Math.max(0, nextLengthMs - overlapMs);
}
