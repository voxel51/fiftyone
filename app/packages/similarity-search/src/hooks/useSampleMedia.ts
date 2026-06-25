import { useCallback, useEffect, useMemo, useRef } from "react";
import { SimilarityRun } from "../types";
import { SAMPLE_MEDIA_CACHE_MAX_ENTRIES } from "../constants";

/**
 * Simple LRU cache backed by a Map (which preserves insertion order).
 * Accessing a key via `get` bumps it to most-recently-used.
 */
class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Bump to most-recently-used
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    // Evict oldest entries
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
      }
    }
  }

  /** Merge a batch of entries, evicting as needed. */
  mergeBatch(entries: Record<string, V>): void {
    for (const [k, v] of Object.entries(entries)) {
      this.set(k as unknown as K, v);
    }
  }

  /** Snapshot the cache as a plain object for rendering. */
  toRecord(): Record<string, V> {
    const out: Record<string, V> = {};
    for (const [k, v] of this.map) {
      out[String(k)] = v;
    }
    return out;
  }
}

type UseSampleMediaOptions = {
  /** Latest media batch from the panel data. */
  sampleMedia: Record<string, string>;
  /** The currently expanded run IDs. */
  expandedRunIds: Set<string>;
  /** Filtered runs visible in the list. */
  filteredRuns: SimilarityRun[];
  /** Trigger to fetch media for given sample IDs. */
  onGetSampleMedia: (payload: { sample_ids: string[] }) => void;
  /** Maximum cache entries. Default: SAMPLE_MEDIA_CACHE_MAX_ENTRIES. */
  maxEntries?: number;
};

type UseSampleMediaResult = {
  /** Merged media map (cache + latest batch). */
  mergedMedia: Record<string, string>;
  /** Toggle expand for a run; fetches media if newly expanded. */
  handleToggleExpand: (run: SimilarityRun) => void;
};

/**
 * Hook that manages sample media caching and fetching for expanded runs.
 *
 * Owns an LRU cache of sample ID → media URL mappings and handles
 * triggering media fetches when runs are expanded.
 */
export const useSampleMedia = ({
  sampleMedia,
  expandedRunIds,
  filteredRuns,
  onGetSampleMedia,
  maxEntries = SAMPLE_MEDIA_CACHE_MAX_ENTRIES,
}: UseSampleMediaOptions): UseSampleMediaResult => {
  const cacheRef = useRef(new LRUCache<string, string>(maxEntries));
  const pendingFetchRef = useRef<string | null>(null);

  // Merge incoming media batch into cache
  useEffect(() => {
    if (sampleMedia && Object.keys(sampleMedia).length > 0) {
      cacheRef.current.mergeBatch(sampleMedia);
    }
  }, [sampleMedia]);

  const handleToggleExpand = useCallback(
    (run: SimilarityRun) => {
      if (expandedRunIds.has(run.run_id)) {
        // Will be collapsed by the caller
        return;
      }
      // Schedule media fetch for newly expanded run
      pendingFetchRef.current = run.run_id;
    },
    [expandedRunIds],
  );

  // Fetch media after expansion state settles
  useEffect(() => {
    const runId = pendingFetchRef.current;
    if (!runId || !expandedRunIds.has(runId)) {
      pendingFetchRef.current = null;
      return;
    }
    pendingFetchRef.current = null;

    const run = filteredRuns.find((r) => r.run_id === runId);
    if (!run) return;

    const positiveIds = Array.isArray(run.query) ? run.query : [];
    const negativeIds = run.negative_query_ids ?? [];
    const allIds = [...positiveIds, ...negativeIds];
    if (allIds.length > 0) {
      onGetSampleMedia({ sample_ids: allIds });
    }
  }, [expandedRunIds, filteredRuns, onGetSampleMedia]);

  // Memoize the merged map so consumers (RichList items) don't see a
  // new reference on every render. Recomputes when the incoming batch
  // changes — at that point the cache has just been updated by the
  // effect above, so reading it here is consistent.
  const mergedMedia = useMemo(
    () => ({
      ...cacheRef.current.toRecord(),
      ...sampleMedia,
    }),
    [sampleMedia],
  );

  return { mergedMedia, handleToggleExpand };
};
