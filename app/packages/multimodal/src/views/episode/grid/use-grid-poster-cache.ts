import { useEffect, useState } from "react";

import {
  getGridPosterCache,
  shouldReplaceGridPoster,
  type GridPosterCacheEntry,
  type GridPosterCacheKey,
} from "./grid-poster-cache";
import { getGridPosterPersistence } from "./grid-poster-persistence";

export type GridPosterCacheLookupStatus = "idle" | "loading" | "hit" | "miss";

interface PersistentLookup {
  readonly entry: GridPosterCacheEntry | null;
  readonly key: GridPosterCacheKey | null;
  readonly status: "hit" | "miss";
}

const EMPTY_LOOKUP: PersistentLookup = {
  entry: null,
  key: null,
  status: "miss",
};

/**
 * Resolves one poster from the synchronous memory tier first, then promotes a
 * reload-surviving IndexedDB hit. Disk reads are restricted to visible grid
 * cells so virtualization does not hydrate the hidden tile cache.
 */
export function useGridPosterCache(
  key: GridPosterCacheKey | null,
  enabled: boolean,
): {
  readonly entry: GridPosterCacheEntry | null;
  readonly status: GridPosterCacheLookupStatus;
} {
  const memoryEntry = key ? getGridPosterCache().peek(key) : null;
  const [persistentLookup, setPersistentLookup] =
    useState<PersistentLookup>(EMPTY_LOOKUP);

  useEffect(() => {
    if (!enabled || !key || getGridPosterCache().peek(key)) return undefined;
    let active = true;
    void getGridPosterPersistence()
      .get(key)
      .then((persisted) => {
        if (!active) return;
        if (persisted) {
          const memory = getGridPosterCache();
          if (shouldReplaceGridPoster(memory.peek(key), persisted)) {
            memory.put(key, persisted);
          }
        }
        setPersistentLookup({
          entry: persisted,
          key,
          status: persisted ? "hit" : "miss",
        });
      })
      .catch(() => {
        if (active) setPersistentLookup({ entry: null, key, status: "miss" });
      });
    return () => {
      active = false;
    };
  }, [enabled, key, memoryEntry]);

  if (!key || !enabled) return { entry: memoryEntry, status: "idle" };
  if (memoryEntry) return { entry: memoryEntry, status: "hit" };
  if (persistentLookup.key !== key) {
    return { entry: null, status: "loading" };
  }
  return {
    entry: persistentLookup.entry,
    status: persistentLookup.status,
  };
}
