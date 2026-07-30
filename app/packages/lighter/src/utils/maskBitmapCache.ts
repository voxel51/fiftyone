/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LRUCache } from "lru-cache";
import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import { decodeMask, type DecodedMask } from "./maskDecoding";

/** A mask's raw source — the same value {@link decodeMask} consumes. */
export type MaskSource = string | OverlayMask;

/** Default cap — 256 MB of decoded mask pixels. */
const DEFAULT_MAX_BYTES = 256e6;

/** localStorage key + Vite env var for the cap override (see below). */
const MAX_BYTES_LOCALSTORAGE_KEY = "fo:maskCacheBytes";

/**
 * Resolve a cap override so eviction can be exercised at a size a dev machine
 * actually reaches during playback — the real cap holds thousands of masks, so
 * nothing is ever evicted in a local session. Precedence: `localStorage`
 * (runtime, no rebuild) then `VITE_MASK_CACHE_BYTES` (build-time). Returns
 * `null` when unset, so the default cap applies.
 */
const readMaxBytesOverride = (): number | null => {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem(MAX_BYTES_LOCALSTORAGE_KEY);
      const parsed = stored === null ? Number.NaN : Number(stored);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    } catch {
      // localStorage can throw in locked-down contexts; fall through to env.
    }
  }

  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  const parsed = Number(env?.VITE_MASK_CACHE_BYTES);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

interface Entry {
  decoded: DecodedMask;
  /** Live borrows. An entry is only closeable at zero. */
  refs: number;
  bytes: number;
}

/**
 * Cache of decoded mask bitmaps, keyed by raw mask source identity.
 *
 * Decoding a mask is the expensive step of drawing one: base64 → RGBA raster →
 * `ImageBitmap` → GPU upload. Without a cache the video surface repeats all of
 * it on every frame advance, because the frame-locked bridge reuses one overlay
 * per track and hands it a new label — and therefore a new mask source — each
 * frame. Re-visiting a frame (scrubbing back, replaying) then costs a full
 * decode it has already paid for.
 *
 * ## Keying
 *
 * Entries are keyed by the raw source itself rather than by `(track, frame)`,
 * so nothing has to hash a mask on the hot path and invalidation is automatic:
 * an edit yields a different source and therefore a miss.
 *
 * The backing map compares keys as a `Map` does, which splits by source type.
 * Inline base64 sources — the common case — compare by VALUE, so a mask
 * repeated unchanged across frames (a track holding still) collapses to one
 * entry no matter how many times it was serialized. That is sound because a
 * decode is a pure function of its source: the raster is color-independent,
 * with display color applied as a GPU tint at draw time. `OverlayMask` sources
 * from `mask_path` are objects and so compare by REFERENCE; re-decoding the
 * same path yields a fresh object and misses here, but `decodeMaskPath` already
 * dedupes those by URL upstream.
 *
 * ## Ownership
 *
 * Consumers BORROW bitmaps: {@link acquire} / {@link acquireAsync} hand back an
 * entry and take a reference, {@link release} gives it back. A borrowed entry
 * is never closed, even when the LRU evicts it under budget pressure — it is
 * held aside and closed on final release instead. Drawing a closed
 * `ImageBitmap` throws at texture upload, so this is load-bearing rather than
 * merely tidy.
 *
 * Borrowers share one entry, so a borrowed {@link DecodedMask} — its bitmap and
 * its `rawPixels` alike — is read-only. Derive rather than mutate in place.
 */
export class MaskBitmapCache {
  private readonly cache: LRUCache<MaskSource, Entry>;

  /**
   * Entries the LRU has dropped but a consumer still holds. Kept alive here so
   * the borrow stays valid; closed once the last reference is released.
   */
  private readonly detached = new Map<MaskSource, Entry>();

  /** In-flight decodes, so concurrent callers share one worker round-trip. */
  private readonly inflight = new Map<MaskSource, Promise<DecodedMask>>();

  private decodes = 0;
  private hits = 0;
  private evictions = 0;
  /**
   * Misses that joined a decode already in flight. High `joins` with low `hits`
   * means warming isn't running far enough ahead of the draw: the work is
   * shared rather than wasted, but it still lands late.
   */
  private joins = 0;

  /** @param maxBytes - Cap on decoded pixels held. */
  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.cache = new LRUCache<MaskSource, Entry>({
      maxSize: maxBytes,
      sizeCalculation: (entry) => entry.bytes,
      dispose: (entry, key) => {
        this.evictions++;

        if (entry.refs > 0) {
          this.detached.set(key, entry);
        } else {
          entry.decoded.bitmap.close();
        }
      },
    });
  }

  /**
   * Borrow an already-decoded mask, or `undefined` on a miss.
   *
   * Synchronous by design: a hit must be drawable in the same tick as the frame
   * advance that asked for it, since resolving a tick later is precisely the
   * lag this cache exists to remove.
   */
  acquire(source: MaskSource): DecodedMask | undefined {
    const entry = this.lookup(source);

    if (!entry) {
      return undefined;
    }

    this.hits++;
    entry.refs++;

    return entry.decoded;
  }

  /**
   * Counters for diagnosing playback behavior. `decodes` far exceeding the
   * clip's distinct mask count across a loop means the working set doesn't fit
   * and entries are being re-decoded every pass.
   */
  stats(): {
    decodes: number;
    hits: number;
    joins: number;
    evictions: number;
    entries: number;
    sizeBytes: number;
    maxBytes: number;
  } {
    return {
      decodes: this.decodes,
      hits: this.hits,
      joins: this.joins,
      evictions: this.evictions,
      entries: this.cache.size,
      sizeBytes: this.cache.calculatedSize ?? 0,
      maxBytes: this.cache.maxSize,
    };
  }

  resetStats(): void {
    this.decodes = 0;
    this.hits = 0;
    this.joins = 0;
    this.evictions = 0;
  }

  /**
   * Borrow a mask, decoding it if absent. Concurrent callers for the same
   * source share a single decode.
   */
  async acquireAsync(source: MaskSource): Promise<DecodedMask> {
    const hit = this.acquire(source);

    if (hit) {
      return hit;
    }

    const decoded = await this.decodeOnce(source);

    // Another caller may have stored this source while we awaited; prefer the
    // stored entry so every borrower shares one bitmap and one refcount.
    const existing = this.lookup(source);

    if (existing) {
      if (existing.decoded !== decoded) {
        decoded.bitmap.close();
      }

      existing.refs++;

      return existing.decoded;
    }

    this.store(source, decoded);

    return decoded;
  }

  /**
   * Whether a source is decoded and drawable right now, WITHOUT taking a
   * reference. For readiness checks, which ask about many masks per tick and
   * must not accumulate borrows.
   */
  has(source: MaskSource): boolean {
    return this.cache.has(source) || this.detached.has(source);
  }

  /** Whether a decode for this source is already in flight. */
  isWarming(source: MaskSource): boolean {
    return this.inflight.has(source);
  }

  /**
   * Decode a source into the cache without holding it. Resolves once the entry
   * is drawable (or the decode has failed), so a caller can warm ahead of the
   * playhead and let {@link has} report readiness afterwards.
   */
  async warm(source: MaskSource): Promise<void> {
    if (this.has(source)) {
      return;
    }

    try {
      await this.acquireAsync(source);
    } finally {
      // Warming takes no lasting reference — hand the borrow straight back so
      // the entry is evictable like any other.
      this.release(source);
    }
  }

  /**
   * Return a borrow. Closes the bitmap if this was the last reference to an
   * entry the LRU has already dropped.
   */
  release(source: MaskSource): void {
    const entry = this.cache.peek(source) ?? this.detached.get(source);

    if (!entry || entry.refs === 0) {
      return;
    }

    entry.refs--;

    if (entry.refs > 0) {
      return;
    }

    if (this.detached.delete(source)) {
      entry.decoded.bitmap.close();
    }
  }

  /**
   * Drop every entry. Borrowed entries are detached rather than closed, so a
   * consumer mid-draw keeps a valid bitmap until it releases.
   */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  /** Total bytes currently held by the LRU (excludes detached borrows). */
  get sizeBytes(): number {
    return this.cache.calculatedSize ?? 0;
  }

  private lookup(source: MaskSource): Entry | undefined {
    return this.cache.get(source) ?? this.detached.get(source);
  }

  private decodeOnce(source: MaskSource): Promise<DecodedMask> {
    const pending = this.inflight.get(source);

    if (pending) {
      this.joins++;
      return pending;
    }

    this.decodes++;

    const decode = decodeMask(source).finally(() => {
      this.inflight.delete(source);
    });

    this.inflight.set(source, decode);

    return decode;
  }

  private store(source: MaskSource, decoded: DecodedMask): void {
    const { width, height } = decoded.rawPixels;

    const entry: Entry = {
      decoded,
      // The caller of `acquireAsync` is the first borrower.
      refs: 1,
      // Decoded RGBA plus the single-channel hit-test copy.
      bytes: Math.max(1, width * height * 5),
    };

    this.cache.set(source, entry);

    // An entry bigger than the whole cap is silently NOT stored (no throw, and
    // `dispose` never runs for it). Track it as a detached borrow so `release`
    // still closes its bitmap; otherwise it leaks. Out of reach at the default
    // cap, but a shrunk one makes single masks oversize easily.
    if (!this.cache.has(source)) {
      this.detached.set(source, entry);
    }
  }
}

/**
 * Process-wide mask bitmap cache. Masks are borrowed by overlays whose
 * lifetimes are shorter than the cache's usefulness (the frame-locked bridge
 * rebuilds an overlay's mask state on every frame advance), so the cache
 * deliberately outlives any one scene.
 *
 * Shrink the cap to exercise eviction locally — at the default a dev session
 * never evicts anything:
 *
 *   localStorage.setItem("fo:maskCacheBytes", "8000000")  // then reload
 */
export const maskBitmapCache = new MaskBitmapCache(
  readMaxBytesOverride() ?? DEFAULT_MAX_BYTES,
);
