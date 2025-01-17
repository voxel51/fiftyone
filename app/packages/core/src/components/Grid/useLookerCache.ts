import type * as fos from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useMemo } from "react";

const MAX_LRU_CACHE_ITEMS = 510;
const MAX_LRU_CACHE_SIZE = 1e9;

interface Lookers extends EventTarget {
  destroy: () => void;
  getSizeBytesEstimate: () => number;
}

interface Entry<T extends Lookers | fos.Lookers = fos.Lookers> {
  instance: T;
  dispose: boolean;
}

export default function useLookerCache<
  T extends Lookers | fos.Lookers = fos.Lookers
>(reset: string) {
  return useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    const loaded = new LRUCache<string, Entry<T>>({
      dispose: (looker) => {
        looker.dispose && looker.instance.destroy();
      },
      max: MAX_LRU_CACHE_ITEMS,
      maxSize: MAX_LRU_CACHE_SIZE,
      noDisposeOnSet: true,
      sizeCalculation: (looker) => looker.instance.getSizeBytesEstimate(),
      updateAgeOnGet: true,
    });

    // an intermediate mapping until the "load" event
    // "load" must occur before requesting the size bytes estimate
    const loading = new Map<string, Entry<T>>();

    return {
      delete: (key: string) => {
        loading.delete(key);
        loaded.delete(key);
      },
      get: (key: string) => loaded.get(key) ?? loading.get(key),
      keys: function* () {
        for (const it of loading.keys()) {
          yield it;
        }
        for (const it of loaded.keys()) {
          yield it;
        }
      },
      loadingSize: () => loading.size,
      loadedSize: () => loaded.size,
      set: (key: string, entry: Entry<T>) => {
        const onReady = () => {
          loaded.set(key, entry);
          loading.delete(key);
          entry.instance.removeEventListener("load", onReady);
        };

        entry.instance.addEventListener("load", onReady);
        loading.set(key, entry);
      },
      sizeEstimate: () => loaded.calculatedSize,
    };
  }, [reset]);
}
