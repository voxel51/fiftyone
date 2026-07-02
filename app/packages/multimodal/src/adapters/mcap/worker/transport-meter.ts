import type { ByteReadDebugLog } from "../../../query/bytes";

/**
 * Worker lane a transport snapshot came from. Kept structural here so the
 * resource-client contract can reference it without importing worker
 * internals.
 */
export type McapTransportLane = "foreground" | "idle" | "bulk";

/**
 * One lane's cumulative transport counters, forwarded to health listeners.
 */
export interface McapLaneTransportSnapshot {
  readonly lane: McapTransportLane;
  readonly snapshot: McapTransportSnapshot;
}

/**
 * Cumulative network-transport counters for one worker, sampled by the main
 * thread from response envelopes. Values only ever grow; consumers diff
 * consecutive snapshots from the same worker, so the clock only needs to be
 * consistent within that worker.
 */
export interface McapTransportSnapshot {
  /**
   * Wall milliseconds with at least one network fetch in flight (union of
   * fetch intervals), on the worker's monotonic clock.
   */
  readonly busyMs: number;

  /**
   * Worker monotonic time when the snapshot was taken.
   */
  readonly capturedAtMs: number;

  /**
   * Bytes actually fetched over the network (cache hits excluded).
   */
  readonly fetchedBytes: number;

  /**
   * Completed network fetches (cache hits and coalesced reads excluded).
   */
  readonly reads: number;
}

/**
 * Aggregates byte-read completions into link-usage counters.
 *
 * Busy time is the union of fetch intervals, reconstructed from completion
 * events (each read reports its duration): overlap with already-counted time
 * is clipped against the furthest busy edge seen so far. Concurrent fetches
 * therefore count the wall time once, which is what "was the link busy"
 * needs — as opposed to summed durations, which overcount parallelism.
 */
export function createMcapTransportMeter(
  now: () => number = () => globalThis.performance?.now?.() ?? Date.now(),
): {
  onByteRead(entry: ByteReadDebugLog): void;
  snapshot(): McapTransportSnapshot;
} {
  let busyMs = 0;
  let fetchedBytes = 0;
  let lastBusyEndMs = 0;
  let reads = 0;

  return {
    onByteRead(entry) {
      // Cache layers report every logical read; only real transport work
      // counts here. Coalesced reads ride an already-counted fetch interval.
      if (entry.cacheResult !== "fetched" || entry.fetchedBytes <= 0) {
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
