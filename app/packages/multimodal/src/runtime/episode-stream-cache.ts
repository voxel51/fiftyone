import { LRUCache } from "lru-cache";
import { estimateFieldSize } from "../query/cache-utils";
import type { DecodedFrame } from "../ir";

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

/** Byte and entry retention totals for one stream cache. */
export interface EpisodeStreamCacheStats {
  /** Unique decoded bytes referenced by normal and pinned tick placements. */
  readonly decodedBytes: number;
  readonly entryCount: number;
  readonly pinnedEntryCount: number;
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
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly listeners = new Set<() => void>();
  private readonly messageRetention = new Map<DecodedFrame, MessageRetention>();
  private readonly pinned = new Map<string, CacheEntry>();
  private _decodedBytes = 0;
  private _subscriberCount = 0;
  private _revision = 0;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.cache = new LRUCache({
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

  stats(): EpisodeStreamCacheStats {
    return {
      decodedBytes: this._decodedBytes,
      entryCount: this.cache.size,
      pinnedEntryCount: this.pinned.size,
    };
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
    const key = tick.toString();
    return this.pinned.has(key) || this.cache.has(key);
  }

  get(tick: bigint): DecodedFrame | null | undefined {
    const key = tick.toString();
    const pinned = this.pinned.get(key);
    return pinned ? pinned.msg : this.cache.get(key)?.msg;
  }

  cachedTicks(): bigint[] {
    const ticks: bigint[] = [];
    for (const key of this.pinned.keys()) ticks.push(BigInt(key));
    for (const key of this.cache.keys()) ticks.push(BigInt(key));
    return ticks;
  }

  set(
    tick: bigint,
    msg: DecodedFrame | null,
    options?: { readonly pinned?: boolean },
  ): void {
    const key = tick.toString();
    if (options?.pinned || this.pinned.has(key)) {
      const previousEntry = this.pinned.get(key);
      const hadEntry = previousEntry !== undefined;
      const previous = previousEntry?.msg;
      this.cache.delete(key);
      const entry = { msg };
      this.retainEntry(entry);
      if (previousEntry) this.releaseEntry(previousEntry);
      this.pinned.set(key, entry);
      if (!hadEntry || previous !== msg) this.bumpRevision();
      return;
    }

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

  /**
   * Drops ordinary placements outside an inclusive protected runway. Pinned
   * loopback entries are deliberately exempt from memory-pressure pruning.
   */
  pruneOutside(startTick: bigint, endTick: bigint): number {
    let removed = 0;
    for (const key of [...this.cache.keys()]) {
      const tick = BigInt(key);
      if (tick >= startTick && tick <= endTick) continue;
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
    if (this.cache.size === 0 && this.pinned.size === 0) return;
    this.cache.clear();
    for (const entry of this.pinned.values()) this.releaseEntry(entry);
    this.pinned.clear();
    this.bumpRevision();
  }

  clearPinned(): void {
    if (this.pinned.size === 0) return;
    for (const entry of this.pinned.values()) this.releaseEntry(entry);
    this.pinned.clear();
    this.bumpRevision();
  }

  private retainEntry(entry: CacheEntry): void {
    if (!entry.msg) return;
    const retained = this.messageRetention.get(entry.msg);
    if (retained) {
      retained.refs += 1;
      return;
    }
    const bytes = decodedMessageBytes(entry.msg);
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
    this._decodedBytes -= retained.bytes;
  }

  private bumpRevision(): void {
    this._revision++;
    for (const listener of this.listeners) listener();
  }
}

function decodedMessageBytes(message: DecodedFrame): number {
  const output = message.output;
  const hintedBytes = output.resourceHints?.sizeBytes;
  const bytes =
    hintedBytes === undefined
      ? estimateFieldSize(output)
      : hintedBytes +
        estimateFieldSize(output.attributes) +
        estimateFieldSize(output.timing);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : 0;
}
