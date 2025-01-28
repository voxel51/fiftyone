import type * as fos from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useEffect, useMemo } from "react";

interface Entry<T extends Lookers | fos.Lookers = fos.Lookers> {
  dispose: boolean;
  instance: T;
}

interface Lookers extends EventTarget {
  loaded: boolean;
  destroy: () => void;
  getSizeBytesEstimate: () => number;
}

const MAX_LRU_CACHE_ITEMS = 510;
// @ts-ignore
const MAX_LRU_CACHE_SIZE = ((navigator.deviceMemory ?? 8) / 16) * 1e9;

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
  const cache = useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    const loaded = new LRUCache<string, Entry<T>>({
      dispose: (entry) => entry.dispose && entry.instance.destroy(),
      max: MAX_LRU_CACHE_ITEMS,
      maxSize: MAX_LRU_CACHE_SIZE,
      noDisposeOnSet: true,
      sizeCalculation: (entry) => entry.instance.getSizeBytesEstimate(),
      updateAgeOnGet: true,
    });

    // an intermediate mapping until the "load" event
    // "load" must occur before requesting the size bytes estimate
    const loading = new Map<string, T>();

    // visible items are excluded from LRU cache
    const visible = new Map<string, T>();

    const get = (key: string) =>
      visible.get(key) ?? loaded.get(key)?.instance ?? loading.get(key);

    const hide = (key?: string) => {
      if (key) {
        const instance = get(key);
        visible.delete(key);
        instance?.loaded
          ? loaded.set(key, { dispose: true, instance })
          : instance && setLoading(key, instance);
        return;
      }

      for (const key of visible.keys()) hide(key);
    };

    const setLoading = (key: string, instance: T) => {
      const onReady = () => {
        if (loading.has(key)) {
          loaded.set(key, { dispose: true, instance });
          loading.delete(key);
        }

        instance.removeEventListener("load", onReady);
      };

      instance.addEventListener("load", onReady);
      loading.set(key, instance);
    };

    return {
      loaded,
      loading,
      visible,

      delete: () => {
        loaded.clear();
        loading.clear();
        visible.clear();
      },
      empty: () => {
        for (const it of loading.keys()) {
          loaded.delete(it);
          loading.delete(it);
        }
        for (const it of loaded.keys()) {
          loaded.delete(it);
          loading.delete(it);
        }
      },
      get,
      hide,
      isShown: (key: string) => visible.has(key),
      set: (key: string, instance: T) => visible.set(key, instance),
      sizeOf: (key: string) => resolveSize(get(key)),
      show: (key: string) => {
        const entry = loaded.get(key);
        if (entry) {
          entry.dispose = false;
        }

        const instance = get(key);
        loading.delete(key);
        loaded.delete(key);
        instance && visible.set(key, instance);
      },
    };
  }, [reset]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  return cache;
}
