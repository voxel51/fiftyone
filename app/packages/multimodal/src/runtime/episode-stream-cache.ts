import { LRUCache } from "lru-cache";
import { decodedOutputSizeBytes } from "../query/cache-utils";
import type { DecodedFrame } from "../ir";
import { EpisodeCadenceTracker } from "./temporal-policy";

const DEFAULT_MAX_ENTRIES = 512;

// LRUCache's value type must extend `{}`, so wrap so we can represent
// "fetched, no message for this stream" without storing a bare null.
interface CacheEntry {
  readonly msg: DecodedFrame | null;
}

interface MessageRetention {
  readonly bytes: number;
  refs: number;
}

/**
 * Per-stream cache for decoded episode messages, keyed by tick (bigint as string).
 *
 * A cached `null` means the tick was fetched but had no message for this
 * stream — distinct from "not yet fetched", which `has()` reports as false.
 * Tracks subscriber count so the data stream can skip fetching for streams
 * with no active tiles.
 *
 * The cache is also a tiny external store: interpolation hooks read lookahead
 * messages directly from it, so they subscribe to `revision` changes via
 * `subscribeToChanges()` instead of waiting for the playback stream value to
 * change.
 */
export class EpisodeStreamCache {
  private readonly cadence = new EpisodeCadenceTracker();
  private cache: LRUCache<string, CacheEntry>;
  private readonly listeners = new Set<() => void>();
  private readonly messageRetention = new Map<DecodedFrame, MessageRetention>();
  private readonly messagesByRecordId = new Map<string, DecodedFrame>();
  private _decodedBytes = 0;
  private _subscriberCount = 0;
  private _revision = 0;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.cache = this.createCache(maxEntries);
  }

  private createCache(maxEntries: number): LRUCache<string, CacheEntry> {
    return new LRUCache({
      dispose: (entry) => this.releaseEntry(entry),
      max: maxEntries,
    });
  }

  get isActive(): boolean {
    return this._subscriberCount > 0;
  }

  get revision(): number {
    return this._revision;
  }

  get decodedBytes(): number {
    return this._decodedBytes;
  }

  /** Cadence-derived age after which a held observation is visibly stale. */
  observationStaleThresholdNs(): bigint {
    return this.cadence.observationStaleThresholdNs();
  }

  /** Cadence-derived gap limit used by optional observation interpolation. */
  interpolationGapLimitNs(): bigint {
    return this.cadence.interpolationGapLimitNs();
  }

  /**
   * Returns the worker-transferred backing stores currently owned by this
   * cache. A renderer teardown can move these buffers out of the main V8
   * isolate before dropping its last references, instead of waiting for a
   * later garbage collection to release their external memory.
   */
  transferableBuffers(): readonly ArrayBuffer[] {
    const buffers = new Set<ArrayBuffer>();
    for (const message of this.messageRetention.keys()) {
      for (const transferable of message.output.resourceHints?.transferables ??
        []) {
        if (
          transferable instanceof ArrayBuffer &&
          transferable.byteLength > 0
        ) {
          buffers.add(transferable);
        }
      }
    }
    return [...buffers];
  }

  subscribe(): () => void {
    this._subscriberCount++;
    let released = false;
    return () => {
      // Guard against double-release: React StrictMode / effect race
      // conditions can fire cleanup twice, which would otherwise underflow
      // the subscriber count and confuse `isActive` for the next subscribe.
      if (released) return;
      released = true;
      this._subscriberCount = Math.max(0, this._subscriberCount - 1);
      // Last subscriber gone — drop everything. Holding decoded frames
      // for a stream no tile is rendering is pure memory pressure, and a
      // future re-subscribe should start from a clean slate so it can't
      // flash stale data while the next fetch lands.
      if (this._subscriberCount === 0) this.clear();
    };
  }

  subscribeToChanges(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  has(tick: bigint): boolean {
    return this.cache.has(tick.toString());
  }

  get(tick: bigint): DecodedFrame | null | undefined {
    return this.cache.get(tick.toString())?.msg;
  }

  cachedTicks(): bigint[] {
    const ticks: bigint[] = [];
    for (const key of this.cache.keys()) ticks.push(BigInt(key));
    return ticks;
  }

  /**
   * Changes the ordinary placement budget without replacing this external
   * store. Existing tile subscriptions and cache listeners therefore survive
   * a timeline sampling-rate change.
   */
  resize(maxEntries: number): void {
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("Episode stream cache size must be a positive integer");
    }
    if (this.cache.max === maxEntries) return;

    // LRU iteration is newest-first. Retain the entries that fit, insert them
    // oldest-first into the replacement, then release the old cache so decoded
    // message reference accounting remains balanced.
    const currentEntries = [...this.cache.entries()];
    const retainedEntries = currentEntries.slice(0, maxEntries).reverse();
    const next = this.createCache(maxEntries);
    for (const [tick, entry] of retainedEntries) {
      this.retainEntry(entry);
      next.set(tick, entry);
    }
    const droppedEntries = currentEntries.length - retainedEntries.length;
    this.cache.clear();
    this.cache = next;
    if (droppedEntries > 0) this.bumpRevision();
  }

  set(tick: bigint, msg: DecodedFrame | null): void {
    msg = this.canonicalizeMessage(msg);
    if (msg) {
      this.cadence.observe(msg.timestampNs);
    }
    const key = tick.toString();
    const hadEntry = this.cache.has(key);
    // peek() reads the prior value without refreshing LRU recency, so re-setting
    // an unchanged value doesn't promote the entry toward the front of the cache.
    const previous = this.cache.peek(key)?.msg;
    const entry = { msg };
    this.retainEntry(entry);
    // LRUCache's default noDisposeOnSet=false releases the replaced entry via
    // dispose, keeping message-retention byte accounting balanced.
    this.cache.set(key, entry);
    if (!hadEntry || previous !== msg) this.bumpRevision();
  }

  /** Drops placements outside the inclusive playback-order runways. */
  pruneOutsideRanges(
    ranges: readonly {
      readonly endTick: bigint;
      readonly startTick: bigint;
    }[],
  ): number {
    let removed = 0;
    for (const key of [...this.cache.keys()]) {
      const tick = BigInt(key);
      if (
        ranges.some(
          ({ endTick, startTick }) => tick >= startTick && tick <= endTick,
        )
      ) {
        continue;
      }
      if (this.cache.delete(key)) removed += 1;
    }
    if (removed > 0) this.bumpRevision();
    return removed;
  }

  /** Drop every cached entry without touching subscriptions. Used when
   *  the source changes — the active streams stay subscribed but their
   *  previously-cached frames are now from a different recording and
   *  must not be reused. */
  clear(): void {
    this.cadence.clear();
    if (this.cache.size === 0) return;
    this.cache.clear();
    this.bumpRevision();
  }

  private retainEntry(entry: CacheEntry): void {
    if (!entry.msg) return;
    const retained = this.messageRetention.get(entry.msg);
    if (retained) {
      retained.refs += 1;
      return;
    }
    const bytes = decodedOutputSizeBytes(entry.msg.output);
    this.messageRetention.set(entry.msg, { bytes, refs: 1 });
    this._decodedBytes += bytes;
  }

  private releaseEntry(entry: CacheEntry): void {
    if (!entry.msg) return;
    const retained = this.messageRetention.get(entry.msg);
    if (!retained) return;
    retained.refs -= 1;
    if (retained.refs > 0) return;
    this.messageRetention.delete(entry.msg);
    if (
      entry.msg.recordId &&
      this.messagesByRecordId.get(entry.msg.recordId) === entry.msg
    ) {
      this.messagesByRecordId.delete(entry.msg.recordId);
    }
    this._decodedBytes -= retained.bytes;
  }

  private canonicalizeMessage(msg: DecodedFrame | null): DecodedFrame | null {
    if (!msg?.recordId) return msg;

    const existing = this.messagesByRecordId.get(msg.recordId);
    if (existing) return existing;

    this.messagesByRecordId.set(msg.recordId, msg);
    return msg;
  }

  private bumpRevision(): void {
    this._revision++;
    for (const listener of this.listeners) listener();
  }
}
