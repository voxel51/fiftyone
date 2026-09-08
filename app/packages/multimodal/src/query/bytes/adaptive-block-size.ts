import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { defaultByteCacheBlockSizeBytes } from "./cached-byte-client";
import type { ByteRangeReadRequest, ByteReadDebugLog } from "./types";

/**
 * The read-profile hint comes from the filepath scheme, which misses a
 * common deployment: a "local" path served by a remote FiftyOne session,
 * where every byte still crosses a WAN. This block-size policy watches what
 * small fetches actually cost and promotes such sources to the remote fill
 * size, so high-latency links amortize round trips over bigger blocks.
 *
 * Promotion is a one-way latch per source: block sizes key cache fills, so
 * flapping between sizes would fragment both cache layers.
 */

/**
 * Small fetches approximate round-trip cost; larger ones are dominated by
 * transfer time and would pollute the latency estimate.
 */
const SMALL_FETCH_MAX_BYTES = 1024 * 1024;

/**
 * Observed-latency EWMA above this marks the source as remote-behaving.
 * Local disk serves small ranges in single-digit milliseconds; anything
 * consistently slower is paying real network time.
 */
const SLOW_SMALL_FETCH_MS = 30;

/**
 * Minimum small-fetch observations before trusting the estimate.
 */
const MIN_SAMPLES = 4;

const EWMA_WEIGHT = 0.3;

/**
 * Creates the measurement-driven block-size policy plus the read observer
 * that feeds it. Callers chain `onRead` with their own observers.
 */
export function createAdaptiveByteCacheBlockSize(): {
  blockSizeBytes: (request: ByteRangeReadRequest) => number | undefined;
  onRead: (entry: ByteReadDebugLog) => void;
} {
  const latencyBySource = new Map<
    string,
    { ewmaMs: number; promoted: boolean; samples: number }
  >();

  return {
    blockSizeBytes(request: ByteRangeReadRequest): number | undefined {
      const base = defaultByteCacheBlockSizeBytes(request);
      if (request.source.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE) {
        return base;
      }

      const stats = latencyBySource.get(request.source.sourceId);
      if (!stats?.promoted) {
        return base;
      }

      return Math.max(base, DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES);
    },

    onRead(entry: ByteReadDebugLog) {
      if (
        entry.cacheResult !== "fetched" ||
        entry.fetchedBytes <= 0 ||
        entry.fetchedBytes > SMALL_FETCH_MAX_BYTES ||
        entry.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
      ) {
        return;
      }

      let stats = latencyBySource.get(entry.sourceId);
      if (!stats) {
        stats = { ewmaMs: entry.durationMs, promoted: false, samples: 0 };
        latencyBySource.set(entry.sourceId, stats);
      }
      stats.samples += 1;
      stats.ewmaMs =
        stats.ewmaMs * (1 - EWMA_WEIGHT) + entry.durationMs * EWMA_WEIGHT;
      if (
        !stats.promoted &&
        stats.samples >= MIN_SAMPLES &&
        stats.ewmaMs >= SLOW_SMALL_FETCH_MS
      ) {
        stats.promoted = true;
      }
    },
  };
}
