import type * as fos from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useMemo } from "react";

const MAX_LRU_CACHE_ITEMS = 510;
const MAX_LRU_CACHE_SIZE = 1e9;

interface Lookers extends EventTarget {
  loaded: boolean;
  destroy: () => void;
  getSizeBytesEstimate: () => number;
}

interface Entry<T extends Lookers | fos.Lookers = fos.Lookers> {
  dispose: boolean;
  instance: T;
}

const resolveSize = <T extends Lookers | fos.Lookers = fos.Lookers>(
  looker?: T
) => {
  if (!looker) {
    throw new Error("not found");
  }

  if (looker.loaded) {
    return looker.getSizeBytesEstimate();
  }

  return new Promise<number>((resolve) => {
    const load = () => {
      looker.removeEventListener("load", load);
      resolve(looker.getSizeBytesEstimate());
    };

    looker.addEventListener("load", load);
  });
};

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

    // visible items are excluded from LRU cache
    const visible = new Map<string, T>();

    const get = (key: string) => {
      const instance = visible.get(key);
      if (instance) {
        return { dispose: false, instance };
      }

      return loaded.get(key) ?? loading.get(key);
    };
    const hide = (key?: string) => {
      if (!key) {
        for (const key of visible.keys()) hide(key);
        return;
      }

      const instance = visible.get(key);
      if (!instance) {
        console.warn("instance not found");
        return;
      }
      visible.delete(key);
      const entry = { dispose: true, instance };
      instance.loaded ? loaded.set(key, entry) : setLoading(key, entry);
    };
    const remove = (key: string) => {
      loading.delete(key);
      loaded.delete(key);
    };
    const setLoading = (key: string, entry: Entry<T>) => {
      const onReady = () => {
        loaded.set(key, entry);
        loading.delete(key);
        entry.instance.removeEventListener("load", onReady);
      };

      entry.instance.addEventListener("load", onReady);
      loading.set(key, entry);
    };

    const assertedGet = (key: string) => {
      const entry = get(key);
      if (!entry) {
        throw new Error("not found");
      }

      return entry;
    };

    return {
      remove,
      get,
      hidden: function* () {
        for (const it of loading.keys()) {
          yield it;
        }
        for (const it of loaded.keys()) {
          yield it;
        }
      },
      hide,
      loadingSize: () => loading.size,
      loadedSize: () => loaded.size,
      set: (key: string, instance: T) => visible.set(key, instance),
      show: (key: string) => {
        const entry = assertedGet(key);
        entry.dispose = false;
        remove(key);
        visible.set(key, entry?.instance);
      },
      isShown: (key: string) => visible.has(key),
      sizeOf: (key: string) => resolveSize(assertedGet(key).instance),
      sizeEstimate: () => loaded.calculatedSize,
    };
  }, [reset]);
}
