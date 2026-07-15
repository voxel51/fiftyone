import { BYTE_SOURCE_READ_PROFILE, type ByteReadDebugLog } from "./query/bytes";
import { monotonicNowMs } from "./time";

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
  let fetchedBytes = 0;
  let lastBusyEndMs = 0;
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
      busyMs += Math.max(0, endMs - Math.max(startMs, lastBusyEndMs));
      lastBusyEndMs = Math.max(lastBusyEndMs, endMs);
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
