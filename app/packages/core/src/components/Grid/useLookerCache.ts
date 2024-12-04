import { Lookers } from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useMemo } from "react";

const MAX_LRU_CACHE_ITEMS = 510;
const MAX_LRU_CACHE_SIZE = 1e9;

export default function useLookerCache(reset: string) {
  return useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    const loaded = new LRUCache<string, Lookers>({
      dispose: (looker) => looker.destroy(),
      max: MAX_LRU_CACHE_ITEMS,
      maxSize: MAX_LRU_CACHE_SIZE,
      noDisposeOnSet: true,
      sizeCalculation: (looker) => {
        console.log(looker.getSizeBytesEstimate());
        return looker.getSizeBytesEstimate();
      },
      updateAgeOnGet: true,
    });

    // an intermediate mapping while until the "load" event
    // "load" must occur before requesting the size bytes estimate
    const loading = new Map<string, Lookers>();

    return {
      delete: (key: string) => {
        loading.delete(key);
        loaded.delete(key);
      },
      get: (key: string) => loaded.get(key) ?? loading.get(key),
      keys: function* () {
        for (const it of loading.keys()) {
          yield* it;
        }
        for (const it of loaded.keys()) {
          yield* it;
        }
      },
      set: (key: string, looker: Lookers) => {
        const onReady = () => {
          loaded.set(key, looker);
          loading.delete(key);
          looker.removeEventListener("load", onReady);
        };

        looker.addEventListener("load", onReady);
        loading.set(key, looker);
      },
    };
  }, [reset]);
}
