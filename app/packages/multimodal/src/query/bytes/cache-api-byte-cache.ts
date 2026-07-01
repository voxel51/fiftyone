import { byteSourceCacheKey } from "./cache";
import type { ByteRangeCache, ByteRangeReadResult } from "./types";

/**
 * Persistent shared byte-range cache backed by the browser Cache API.
 *
 * The in-memory byte cache is per execution context: every worker lane pays
 * its own network fetches and its budget churns under playback pressure.
 * Cache API storage is origin-scoped, so one stored block serves the main
 * thread, both playback lanes, and the grid preview pool — and survives
 * reloads, which matters most on remote object-storage transports where a
 * refetch costs a round trip plus transfer instead of microseconds.
 *
 * Entries are keyed by content identity (stable source id plus discovered
 * byte size), never by access URL, so rotating signed URLs keep hitting.
 * A changed file size invalidates naturally; same-size content rewrites are
 * not detected (an ETag validator is a known follow-up).
 *
 * Storage discipline: only deterministic read shapes (block fills and chunk
 * ranges) should reach this layer — the cached byte client gates exact
 * one-off reads. Eviction is approximate by design: per-source entry budgets
 * enforced from lazily-initialized counts, oldest-first by insertion order.
 * A cache must never break reads, so every operation degrades to a miss.
 */

const DEFAULT_CACHE_NAME_PREFIX = "fo-multimodal-bytes-v1--";
const ENTRY_ORIGIN = "https://multimodal-bytes.fiftyone.internal";
const DEFAULT_MAX_ENTRIES_PER_SOURCE = 256;
const EVICTION_SLACK_ENTRIES = 16;
const DEFAULT_MAX_SOURCES = 8;

/**
 * Options for constructing the Cache API byte-range cache.
 */
export interface CreateCacheApiByteRangeCacheOptions {
  /**
   * Cache name prefix; distinct prefixes isolate incompatible layouts.
   */
  readonly cacheNamePrefix?: string;

  /**
   * CacheStorage override for tests; defaults to `globalThis.caches`.
   */
  readonly cacheStorage?: CacheStorage;

  /**
   * Per-source stored entry budget before oldest-first eviction.
   */
  readonly maxEntriesPerSource?: number;

  /**
   * Distinct source budget before whole oldest source caches are dropped.
   */
  readonly maxSources?: number;
}

/**
 * Creates the persistent byte-range cache, or undefined when the runtime
 * has no usable Cache API (non-secure contexts, some test environments).
 */
export function createCacheApiByteRangeCache(
  options: CreateCacheApiByteRangeCacheOptions = {},
): ByteRangeCache | undefined {
  const cacheStorage =
    options.cacheStorage ?? (globalThis as { caches?: CacheStorage }).caches;
  if (!cacheStorage || typeof cacheStorage.open !== "function") {
    return undefined;
  }

  const cacheNamePrefix = options.cacheNamePrefix ?? DEFAULT_CACHE_NAME_PREFIX;
  const maxEntriesPerSource =
    options.maxEntriesPerSource ?? DEFAULT_MAX_ENTRIES_PER_SOURCE;
  const maxSources = options.maxSources ?? DEFAULT_MAX_SOURCES;

  const openCaches = new Map<string, Promise<Cache | undefined>>();
  const entryCounts = new Map<string, Promise<number>>();
  let sourceBudgetApplied = false;

  const openSourceCache = (sourceKey: string): Promise<Cache | undefined> => {
    const cacheName = `${cacheNamePrefix}${encodeURIComponent(sourceKey)}`;
    let open = openCaches.get(cacheName);
    if (!open) {
      open = (async () => {
        try {
          await applySourceBudgetOnce(cacheName);
          return await cacheStorage.open(cacheName);
        } catch {
          return undefined;
        }
      })();
      openCaches.set(cacheName, open);
    }

    return open;
  };

  const applySourceBudgetOnce = async (currentCacheName: string) => {
    if (sourceBudgetApplied) {
      return;
    }
    sourceBudgetApplied = true;
    try {
      const names = (await cacheStorage.keys()).filter(
        (name) => name.startsWith(cacheNamePrefix) && name !== currentCacheName,
      );
      // Insertion order approximates age; the budget bounds disk, not
      // correctness, so coarse oldest-first eviction is acceptable.
      const excess = names.length + 1 - maxSources;
      for (const name of names.slice(0, Math.max(0, excess))) {
        await cacheStorage.delete(name);
      }
    } catch {
      // Budget enforcement is best-effort.
    }
  };

  const countEntries = (sourceKey: string, cache: Cache): Promise<number> => {
    let count = entryCounts.get(sourceKey);
    if (!count) {
      count = cache.keys().then(
        (keys) => keys.length,
        () => 0,
      );
      entryCounts.set(sourceKey, count);
    }

    return count;
  };

  const evictOverBudget = async (sourceKey: string, cache: Cache) => {
    const count = await countEntries(sourceKey, cache);
    if (count <= maxEntriesPerSource) {
      return;
    }
    try {
      const keys = await cache.keys();
      const removeCount = Math.max(
        0,
        keys.length - maxEntriesPerSource + EVICTION_SLACK_ENTRIES,
      );
      for (const request of keys.slice(0, removeCount)) {
        await cache.delete(request);
      }
      entryCounts.set(
        sourceKey,
        Promise.resolve(Math.max(0, keys.length - removeCount)),
      );
    } catch {
      entryCounts.delete(sourceKey);
    }
  };

  return {
    async clear() {
      try {
        const names = (await cacheStorage.keys()).filter((name) =>
          name.startsWith(cacheNamePrefix),
        );
        await Promise.all(names.map((name) => cacheStorage.delete(name)));
      } catch {
        // Cache clearing is best-effort.
      }
      openCaches.clear();
      entryCounts.clear();
    },

    async get(request) {
      try {
        const sourceKey = byteSourceCacheKey(request.source);
        const cache = await openSourceCache(sourceKey);
        if (!cache) {
          return undefined;
        }

        const url = entryUrl(
          sourceKey,
          request.source.sizeBytes,
          request.range,
        );
        const match = await cache.match(url);
        if (!match) {
          return undefined;
        }

        const bytes = new Uint8Array(await match.arrayBuffer());
        if (BigInt(bytes.byteLength) !== request.range.length) {
          // A truncated or corrupted entry must read as a miss, and staying
          // stored would just repeat the mismatch on every lookup.
          await cache.delete(url);
          return undefined;
        }

        return {
          bytes,
          range: request.range,
          source: request.source,
        };
      } catch {
        return undefined;
      }
    },

    async put(result: ByteRangeReadResult) {
      if (result.bytes.byteLength === 0) {
        return;
      }
      try {
        const sourceKey = byteSourceCacheKey(result.source);
        const cache = await openSourceCache(sourceKey);
        if (!cache) {
          return;
        }

        const url = entryUrl(sourceKey, result.source.sizeBytes, result.range);
        // Response bodies adopt the buffer, so copy: callers keep mutating
        // views over pooled read buffers.
        await cache.put(
          url,
          new Response(result.bytes.slice(), {
            headers: {
              "content-type": "application/octet-stream",
              "x-fo-byte-length": String(result.bytes.byteLength),
            },
          }),
        );
        entryCounts.set(
          sourceKey,
          countEntries(sourceKey, cache).then((count) => count + 1),
        );
        await evictOverBudget(sourceKey, cache);
      } catch {
        // Persisting is best-effort; the memory layer already served the read.
      }
    },
  };
}

function entryUrl(
  sourceKey: string,
  sizeBytes: string | undefined,
  range: { readonly length: bigint; readonly offset: bigint },
): string {
  return [
    ENTRY_ORIGIN,
    "v1",
    encodeURIComponent(sourceKey),
    sizeBytes ?? "size-unknown",
    `${range.offset.toString()}-${range.length.toString()}`,
  ].join("/");
}
