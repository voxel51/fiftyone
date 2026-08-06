import { LRUCache } from "lru-cache";
import { decodedOutputSizeBytes } from "../query/cache-utils";
import type { DecodedFrame } from "../ir";
import { EpisodeCadenceTracker } from "./temporal-policy";
import {
  clampTickRanges,
  intersectTickRanges,
  subtractTickRanges,
  type TickIndexRange,
} from "./tick-ranges";
import type { TimelineIndex } from "./timeline-index";

/**
 * Last-resort per-stream placement bound. Ordinary retention is coordinated
 * across streams by decoded-cache-policy; this deliberately wide limit exists
 * only to keep a missing coordinator or untrustworthy byte hint from allowing
 * null/repeated tick placements and their string keys to grow without bound.
 */
export const EPISODE_STREAM_CACHE_EMERGENCY_MAX_ENTRIES = 120_000;

// Conservative V8/Map/LRU bookkeeping estimates. They are intentionally not
// presented as exact heap measurements: browsers expose no reliable memory-
// pressure callback or per-object retained-size API.
const PLACEMENT_METADATA_BYTES = 192;
const MESSAGE_METADATA_BYTES = 192;

// LRUCache's value type must extend `{}`, so wrap so we can represent
// "fetched, no message for this stream" without storing a bare null.
interface CacheEntry {
  readonly msg: DecodedFrame | null;
  readonly placementBytes: number;
}

interface MessageRetention {
  readonly decodedBytes: number;
  readonly metadataBytes: number;
  refs: number;
}

/** Inclusive timeline-index range retained by one stream cache. */
export type EpisodeStreamCacheTickRange = TickIndexRange;

/** A decoded frame whose final placement in one stream cache was pruned. */
export interface EpisodeStreamCacheReleasedMessage {
  readonly decodedBytes: number;
  readonly message: DecodedFrame;
}

/** Detailed result used for incremental global memory accounting. */
export interface EpisodeStreamCachePruneResult {
  readonly releasedMessages: readonly EpisodeStreamCacheReleasedMessage[];
  readonly removedEntries: number;
}

/** Byte and entry retention totals for one stream cache. */
export interface EpisodeStreamCacheStats {
  /** Payload bytes counted once per distinct decoded-frame object. */
  readonly decodedBytes: number;
  readonly entryCount: number;
  /** Conservative wrapper/canonical-record bookkeeping estimate. */
  readonly messageMetadataBytes: number;
  /** Conservative tick key, entry, and LRU bookkeeping estimate. */
  readonly placementBytes: number;
  /** Decoded payload plus message and placement bookkeeping. */
  readonly accountedBytes: number;
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
  private coverage: TimelineCoverage | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly messageRetention = new Map<DecodedFrame, MessageRetention>();
  private readonly messagesByRecordId = new Map<string, DecodedFrame>();
  private _decodedBytes = 0;
  private _messageMetadataBytes = 0;
  private _placementBytes = 0;
  private _subscriberCount = 0;
  private _revision = 0;
  private suppressCoverageUpdates = false;

  constructor(maxEntries = EPISODE_STREAM_CACHE_EMERGENCY_MAX_ENTRIES) {
    this.cache = this.createCache(maxEntries);
  }

  private createCache(maxEntries: number): LRUCache<string, CacheEntry> {
    return new LRUCache({
      dispose: (entry, key, reason) => {
        this.releaseEntry(entry);
        if (!this.suppressCoverageUpdates && reason !== "set") {
          this.removeCoverageTick(BigInt(key));
        }
      },
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

  stats(): EpisodeStreamCacheStats {
    return {
      accountedBytes:
        this._decodedBytes + this._messageMetadataBytes + this._placementBytes,
      decodedBytes: this._decodedBytes,
      entryCount: this.cache.size,
      messageMetadataBytes: this._messageMetadataBytes,
      placementBytes: this._placementBytes,
    };
  }

  /** Visits each decoded frame retained by this cache exactly once. */
  forEachRetainedMessage(
    visit: (message: DecodedFrame, decodedBytes: number) => void,
  ): void {
    for (const [message, retention] of this.messageRetention) {
      visit(message, retention.decodedBytes);
    }
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
   * Binds compressed coverage bookkeeping to a timeline. Rebinding performs
   * one cache-sized rebuild; subsequent inserts/deletes update only the small
   * list of disjoint retained ranges.
   */
  configureTimeline(index: TimelineIndex): void {
    if (
      this.coverage?.startTimeNs === index.startTimeNs &&
      this.coverage.stepNs === index.stepNs &&
      this.coverage.tickCount === index.tickCount
    ) {
      return;
    }
    this.coverage = createTimelineCoverage(index, this.cache.keys());
  }

  /** Compressed, sorted tick coverage for range intersection/shading. */
  cachedTickIndexRanges(
    index: TimelineIndex,
  ): readonly EpisodeStreamCacheTickRange[] {
    this.configureTimeline(index);
    return (this.coverage?.ranges ?? []).map((range) => ({ ...range }));
  }

  /**
   * Accounts only placements inside inclusive timeline-index ranges. The
   * caller can share `seenMessages` across streams for global payload identity
   * deduplication. Forward ranges are time-bounded, so this work stays bounded
   * independently of retained history length.
   */
  memoryStatsForTickIndexRanges(
    ranges: readonly EpisodeStreamCacheTickRange[],
    index: TimelineIndex,
    seenMessages: Set<DecodedFrame> = new Set(),
  ): EpisodeStreamCacheStats {
    this.configureTimeline(index);
    const coveredRanges = intersectTickRanges(
      this.coverage?.ranges ?? [],
      clampTickRanges(ranges, index.tickCount),
    );
    let decodedBytes = 0;
    let entryCount = 0;
    let messageMetadataBytes = 0;
    let placementBytes = 0;
    const localMessages = new Set<DecodedFrame>();
    for (const range of coveredRanges) {
      for (
        let tickIndex = range.startIndex;
        tickIndex <= range.endIndex;
        tickIndex += 1
      ) {
        const tick = index.tickAt(tickIndex);
        if (tick === undefined) continue;
        const entry = this.cache.peek(tick.toString());
        if (!entry) continue;
        entryCount += 1;
        placementBytes += entry.placementBytes;
        if (!entry.msg || localMessages.has(entry.msg)) continue;
        localMessages.add(entry.msg);
        const retention = this.messageRetention.get(entry.msg);
        if (!retention) continue;
        messageMetadataBytes += retention.metadataBytes;
        if (seenMessages.has(entry.msg)) continue;
        seenMessages.add(entry.msg);
        decodedBytes += retention.decodedBytes;
      }
    }
    return {
      accountedBytes: decodedBytes + messageMetadataBytes + placementBytes,
      decodedBytes,
      entryCount,
      messageMetadataBytes,
      placementBytes,
    };
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
    this.suppressCoverageUpdates = true;
    try {
      this.cache.clear();
    } finally {
      this.suppressCoverageUpdates = false;
    }
    this.cache = next;
    if (this.coverage) {
      this.coverage = createTimelineCoverageFromConfig(
        this.coverage,
        this.cache.keys(),
      );
    }
    if (droppedEntries > 0) this.bumpRevision();
  }

  set(tick: bigint, msg: DecodedFrame | null): void {
    if (
      this.coverage &&
      tickIndexInCoverage(this.coverage, tick) === undefined
    ) {
      return;
    }
    msg = this.canonicalizeMessage(msg);
    if (msg) {
      this.cadence.observe(msg.timestampNs);
    }
    const key = tick.toString();
    const hadEntry = this.cache.has(key);
    // peek() reads the prior value without refreshing LRU recency, so re-setting
    // an unchanged value doesn't promote the entry toward the front of the cache.
    const previous = this.cache.peek(key)?.msg;
    const entry = { msg, placementBytes: placementBytesForKey(key) };
    this.retainEntry(entry);
    // LRUCache's default noDisposeOnSet=false releases the replaced entry via
    // dispose, keeping message-retention byte accounting balanced.
    this.cache.set(key, entry);
    if (!hadEntry) this.addCoverageTick(tick);
    if (!hadEntry || previous !== msg) this.bumpRevision();
  }

  /** Deletes every placement in the supplied inclusive timeline ranges. */
  pruneTickIndexRanges(
    ranges: readonly EpisodeStreamCacheTickRange[],
    index: TimelineIndex,
  ): number {
    return this.pruneTickIndexRangesWithStats(ranges, index).removedEntries;
  }

  /** Prunes ranges and reports decoded frames fully released by this cache. */
  pruneTickIndexRangesWithStats(
    ranges: readonly EpisodeStreamCacheTickRange[],
    index: TimelineIndex,
  ): EpisodeStreamCachePruneResult {
    this.configureTimeline(index);
    const normalized = clampTickRanges(ranges, index.tickCount);
    const removedRanges = intersectTickRanges(
      this.coverage?.ranges ?? [],
      normalized,
    );
    if (removedRanges.length === 0) {
      return { releasedMessages: [], removedEntries: 0 };
    }

    let removed = 0;
    const releasedMessages: EpisodeStreamCacheReleasedMessage[] = [];
    this.suppressCoverageUpdates = true;
    try {
      for (const range of removedRanges) {
        for (
          let tickIndex = range.startIndex;
          tickIndex <= range.endIndex;
          tickIndex += 1
        ) {
          const tick = index.tickAt(tickIndex);
          if (tick === undefined) continue;
          const entry = this.cache.peek(tick.toString());
          const retention = entry?.msg
            ? this.messageRetention.get(entry.msg)
            : undefined;
          if (entry?.msg && retention?.refs === 1) {
            releasedMessages.push({
              decodedBytes: retention.decodedBytes,
              message: entry.msg,
            });
          }
          if (this.cache.delete(tick.toString())) {
            removed += 1;
          }
        }
      }
    } finally {
      this.suppressCoverageUpdates = false;
    }
    if (this.coverage) {
      this.coverage.ranges = subtractTickRanges(
        this.coverage.ranges,
        normalized,
      );
    }
    if (removed > 0) this.bumpRevision();
    return { releasedMessages, removedEntries: removed };
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
    this.suppressCoverageUpdates = true;
    try {
      this.cache.clear();
    } finally {
      this.suppressCoverageUpdates = false;
    }
    if (this.coverage) this.coverage.ranges = [];
    this.bumpRevision();
  }

  private retainEntry(entry: CacheEntry): void {
    this._placementBytes += entry.placementBytes;
    if (!entry.msg) return;
    const retained = this.messageRetention.get(entry.msg);
    if (retained) {
      retained.refs += 1;
      return;
    }
    const decodedBytes = decodedOutputSizeBytes(entry.msg.output);
    const metadataBytes = decodedMessageMetadataBytes(entry.msg);
    this.messageRetention.set(entry.msg, {
      decodedBytes,
      metadataBytes,
      refs: 1,
    });
    this._decodedBytes += decodedBytes;
    this._messageMetadataBytes += metadataBytes;
  }

  private releaseEntry(entry: CacheEntry): void {
    this._placementBytes -= entry.placementBytes;
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
    this._decodedBytes -= retained.decodedBytes;
    this._messageMetadataBytes -= retained.metadataBytes;
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

  private addCoverageTick(tick: bigint): void {
    const coverage = this.coverage;
    if (!coverage) return;
    const tickIndex = tickIndexInCoverage(coverage, tick);
    if (tickIndex === undefined) return;
    coverage.ranges = addTickIndex(coverage.ranges, tickIndex);
  }

  private removeCoverageTick(tick: bigint): void {
    const coverage = this.coverage;
    if (!coverage) return;
    const tickIndex = tickIndexInCoverage(coverage, tick);
    if (tickIndex === undefined) return;
    coverage.ranges = subtractTickRanges(coverage.ranges, [
      { endIndex: tickIndex, startIndex: tickIndex },
    ]);
  }
}
function decodedMessageMetadataBytes(message: DecodedFrame): number {
  return (
    MESSAGE_METADATA_BYTES +
    utf16Bytes(message.streamId) +
    utf16Bytes(message.recordId ?? "")
  );
}

function placementBytesForKey(key: string): number {
  return PLACEMENT_METADATA_BYTES + utf16Bytes(key);
}

function utf16Bytes(value: string): number {
  return value.length * 2;
}

interface TimelineCoverage {
  readonly startTimeNs: bigint;
  readonly stepNs: bigint;
  readonly tickCount: number;
  ranges: EpisodeStreamCacheTickRange[];
}

function createTimelineCoverage(
  index: TimelineIndex,
  keys: Iterable<string>,
): TimelineCoverage {
  return createTimelineCoverageFromConfig(
    {
      ranges: [],
      startTimeNs: index.startTimeNs,
      stepNs: index.stepNs,
      tickCount: index.tickCount,
    },
    keys,
  );
}

function createTimelineCoverageFromConfig(
  config: Omit<TimelineCoverage, "ranges"> | TimelineCoverage,
  keys: Iterable<string>,
): TimelineCoverage {
  const indexes: number[] = [];
  for (const key of keys) {
    const tickIndex = tickIndexInCoverage(config, BigInt(key));
    if (tickIndex !== undefined) indexes.push(tickIndex);
  }
  indexes.sort((left, right) => left - right);
  const ranges: EpisodeStreamCacheTickRange[] = [];
  for (const tickIndex of indexes) {
    const last = ranges[ranges.length - 1];
    if (!last || tickIndex > last.endIndex + 1) {
      ranges.push({ endIndex: tickIndex, startIndex: tickIndex });
    } else if (tickIndex > last.endIndex) {
      ranges[ranges.length - 1] = { ...last, endIndex: tickIndex };
    }
  }
  return {
    ranges,
    startTimeNs: config.startTimeNs,
    stepNs: config.stepNs,
    tickCount: config.tickCount,
  };
}

function tickIndexInCoverage(
  coverage: Pick<TimelineCoverage, "startTimeNs" | "stepNs" | "tickCount">,
  tick: bigint,
): number | undefined {
  if (tick < coverage.startTimeNs) return undefined;
  const deltaNs = tick - coverage.startTimeNs;
  if (deltaNs % coverage.stepNs !== 0n) return undefined;
  const indexBig = deltaNs / coverage.stepNs;
  if (indexBig >= BigInt(coverage.tickCount)) return undefined;
  return Number(indexBig);
}

function addTickIndex(
  ranges: readonly EpisodeStreamCacheTickRange[],
  tickIndex: number,
): EpisodeStreamCacheTickRange[] {
  const next = ranges.map((range) => ({ ...range }));
  let low = 0;
  let high = next.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (next[middle].startIndex <= tickIndex) low = middle + 1;
    else high = middle;
  }
  const before = next[low - 1];
  const after = next[low];
  if (before && tickIndex <= before.endIndex) return next;
  if (
    before?.endIndex === tickIndex - 1 &&
    after?.startIndex === tickIndex + 1
  ) {
    next.splice(low - 1, 2, {
      endIndex: after.endIndex,
      startIndex: before.startIndex,
    });
  } else if (before?.endIndex === tickIndex - 1) {
    next[low - 1] = { ...before, endIndex: tickIndex };
  } else if (after?.startIndex === tickIndex + 1) {
    next[low] = { ...after, startIndex: tickIndex };
  } else {
    next.splice(low, 0, { endIndex: tickIndex, startIndex: tickIndex });
  }
  return next;
}

