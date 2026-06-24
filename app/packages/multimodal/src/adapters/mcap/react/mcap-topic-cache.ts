import { LRUCache } from "lru-cache";
import type { McapDecodedMessage } from "../types";

const DEFAULT_MAX_ENTRIES = 512;

// LRUCache's value type must extend `{}`, so wrap so we can represent
// "fetched, no message for this topic" without storing a bare null.
interface CacheEntry {
  readonly msg: McapDecodedMessage | null;
}

/**
 * Per-topic cache for decoded MCAP messages, keyed by tick (bigint as string).
 *
 * A cached `null` means the tick was fetched but had no message for this
 * topic — distinct from "not yet fetched", which `has()` reports as false.
 * Tracks subscriber count so the data stream can skip fetching for topics
 * with no active tiles.
 *
 * The cache is also a tiny external store: interpolation hooks read lookahead
 * messages directly from it, so they subscribe to `revision` changes via
 * `subscribeToChanges()` instead of waiting for the playback stream value to
 * change.
 */
export class McapTopicCache {
  private readonly cache: LRUCache<string, CacheEntry>;
  private readonly listeners = new Set<() => void>();
  private _subscriberCount = 0;
  private _revision = 0;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.cache = new LRUCache({ max: maxEntries });
  }

  get isActive(): boolean {
    return this._subscriberCount > 0;
  }

  get revision(): number {
    return this._revision;
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
      // for a topic no tile is rendering is pure memory pressure, and a
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

  get(tick: bigint): McapDecodedMessage | null | undefined {
    return this.cache.get(tick.toString())?.msg;
  }

  set(tick: bigint, msg: McapDecodedMessage | null): void {
    const key = tick.toString();
    const hadEntry = this.cache.has(key);
    // peek() reads the prior value without refreshing LRU recency, so re-setting
    // an unchanged value doesn't promote the entry toward the front of the cache.
    const previous = this.cache.peek(key)?.msg;
    this.cache.set(key, { msg });
    if (!hadEntry || previous !== msg) this.bumpRevision();
  }

  /** Drop every cached entry without touching subscriptions. Used when
   *  the source changes — the active topics stay subscribed but their
   *  previously-cached frames are now from a different recording and
   *  must not be reused. */
  clear(): void {
    if (this.cache.size === 0) return;
    this.cache.clear();
    this.bumpRevision();
  }

  private bumpRevision(): void {
    this._revision++;
    for (const listener of this.listeners) listener();
  }
}
