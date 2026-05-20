import { LRUCache } from "lru-cache";
import type { ByteSourceDescriptor } from "../../../client/resources";
import {
  createMcapTimelineTicks,
  DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
} from "../timeline";
import type {
  McapActiveTimeline,
  McapResourceClient,
  McapStreamSyncPolicies,
  McapSynchronizedMessageWindow,
  McapTimelineRange,
} from "../types";

const MAX_PREFETCH_BATCH = 32;

/**
 * Shared fetch/cache layer for MCAP synchronized message windows.
 *
 * One coordinator per sample source. Multiple per-topic streams share it so
 * each readSynchronizedMessages call fetches all registered topics at once
 * instead of issuing one request per stream.
 *
 * All time-based methods accept seconds (matching the PlaybackEngine's unit).
 * Internally all queries snap to the nearest pre-generated timeline tick.
 */
export class McapWindowCoordinator {
  readonly durationSec: number;
  readonly ticks: readonly bigint[];

  private readonly cache: LRUCache<string, McapSynchronizedMessageWindow>;
  private readonly pendingFetches = new Map<
    string,
    Promise<McapSynchronizedMessageWindow | null>
  >();
  private readonly startTimeNs: bigint;

  constructor(
    private readonly client: McapResourceClient,
    private readonly source: ByteSourceDescriptor,
    range: McapTimelineRange,
    private readonly topics: readonly string[],
    private readonly streamPolicies: McapStreamSyncPolicies,
    private readonly activeTimeline: McapActiveTimeline,
    maxCacheEntries = 512
  ) {
    this.startTimeNs = range.startTimeNs;
    this.durationSec =
      Number(range.endTimeNs - range.startTimeNs) / 1_000_000_000;
    this.ticks = createMcapTimelineTicks(range, {
      tickRateHz: DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
    });
    this.cache = new LRUCache({ max: maxCacheEntries });
  }

  secToNs(timeSec: number): bigint {
    return (
      this.startTimeNs + BigInt(Math.round(timeSec * 1_000_000_000))
    );
  }

  /**
   * Returns "ready" / "loading" / "missing" for the tick nearest to `timeSec`.
   * Called from the RAF loop — must be synchronous and allocation-free.
   */
  bufferStateAt(timeSec: number): "ready" | "loading" | "missing" {
    const tick = this.nearestTick(timeSec);
    if (tick === undefined) return "missing";
    const key = tick.toString();
    if (this.cache.has(key)) return "ready";
    if (this.pendingFetches.has(key)) return "loading";
    return "missing";
  }

  /**
   * Returns the cached window for the tick nearest to `timeSec`.
   */
  getWindowAt(timeSec: number): McapSynchronizedMessageWindow | undefined {
    const tick = this.nearestTick(timeSec);
    return tick !== undefined ? this.cache.get(tick.toString()) : undefined;
  }

  /**
   * Ensures the window for the tick nearest to `timeSec` is fetched.
   * Returns a Promise that resolves to the window (or null on error/no ticks).
   * Deduplicates concurrent requests for the same tick.
   */
  prefetchAt(timeSec: number): Promise<McapSynchronizedMessageWindow | null> {
    const tick = this.nearestTick(timeSec);
    if (tick === undefined) return Promise.resolve(null);
    const key = tick.toString();

    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);

    const pending = this.pendingFetches.get(key);
    if (pending) return pending;

    const promise = this.client
      .readSynchronizedMessages({
        activeTimeline: this.activeTimeline,
        source: this.source,
        streamPolicies: this.streamPolicies,
        timeNs: tick,
        topics: this.topics,
      })
      .then((window) => {
        this.cache.set(key, window);
        return window;
      })
      .catch(() => null as McapSynchronizedMessageWindow | null)
      .finally(() => {
        this.pendingFetches.delete(key);
      });

    this.pendingFetches.set(key, promise);
    return promise;
  }

  /**
   * Fire-and-forget batch prefetch for ticks in [startSec, endSec] that
   * aren't already cached or in-flight. Called by the playback engine's
   * lookahead lane during playback.
   */
  prefetchRange(startSec: number, endSec: number): void {
    const startNs = this.secToNs(startSec);
    const endNs = this.secToNs(endSec);
    const toFetch: bigint[] = [];

    for (const tick of this.ticks) {
      if (tick < startNs) continue;
      if (tick > endNs) break;
      const key = tick.toString();
      if (!this.cache.has(key) && !this.pendingFetches.has(key)) {
        toFetch.push(tick);
      }
      if (toFetch.length >= MAX_PREFETCH_BATCH) break;
    }

    if (toFetch.length === 0) return;

    // Seed individual promise entries before the async call so concurrent
    // prefetchAt calls for the same ticks return these promises rather than
    // starting duplicate requests.
    const resolvers = new Map<
      string,
      (w: McapSynchronizedMessageWindow | null) => void
    >();
    for (const tick of toFetch) {
      const key = tick.toString();
      this.pendingFetches.set(
        key,
        new Promise<McapSynchronizedMessageWindow | null>((resolve) => {
          resolvers.set(key, resolve);
        })
      );
    }

    this.client
      .readSynchronizedMessageBatch({
        activeTimeline: this.activeTimeline,
        source: this.source,
        streamPolicies: this.streamPolicies,
        timeNs: toFetch,
        topics: this.topics,
      })
      .then((windows) => {
        for (const w of windows) {
          const key = w.timeNs.toString();
          this.cache.set(key, w);
          resolvers.get(key)?.(w);
        }
      })
      .catch(() => {})
      .finally(() => {
        // Settle any ticks the batch response didn't include.
        for (const [key, resolve] of resolvers) {
          if (!this.cache.has(key)) resolve(null);
        }
        for (const tick of toFetch) {
          this.pendingFetches.delete(tick.toString());
        }
      });
  }

  /** Binary-search for the tick nearest to `timeSec`. O(log n). */
  private nearestTick(timeSec: number): bigint | undefined {
    if (this.ticks.length === 0) return undefined;
    const timeNs = this.secToNs(timeSec);
    let lo = 0;
    let hi = this.ticks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.ticks[mid] as bigint) < timeNs) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return this.ticks[0];
    if (lo >= this.ticks.length) return this.ticks[this.ticks.length - 1];
    const before = this.ticks[lo - 1] as bigint;
    const after = this.ticks[lo] as bigint;
    return timeNs - before <= after - timeNs ? before : after;
  }
}
