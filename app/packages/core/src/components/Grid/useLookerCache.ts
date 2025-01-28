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
>(reset: string, maxHiddenItems: number, maxHiddenItemsSizeBytes: number) {
  const cache = useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    const loaded = new LRUCache<string, Entry<T>>({
      dispose: (entry) => entry.dispose && entry.instance.destroy(),
      max: maxHiddenItems,
      maxSize: maxHiddenItemsSizeBytes,
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

      /**
       * Delete all instances
       */
      delete: () => {
        loaded.clear();
        loading.clear();
        visible.clear();
      },

      /**
       * Delete hidden instances
       */
      empty: () => {
        for (const it of loading.keys()) loading.delete(it);
        for (const it of loaded.keys()) loaded.delete(it);
      },

      /**
       * Get an instance
       *
       * @param {string} key - the instance key
       */
      get,

      /**
       * Hide an instance. If a key is not provided, all instances are hidden
       *
       * @param {string=} key - an optional key
       */
      hide,

      /**
       * Determine an instance's visibility
       *
       * @param {string} key - the instance key
       * @returns {boolean} whether it is shown
       */
      isShown: (key: string) => visible.has(key),

      /**
       * Set an instance. The initial state of the instance is always shown
       *
       * @param {string} key - the instance key
       * @param {T} instance - the instance
       * @returns {T} the instance
       */
      set: (key: string, instance: T) => visible.set(key, instance),

      /**
       * Retrieves the size estimate of an instance in bytes
       *
       * @param {string} key - the instance key
       * @returns {Promise<number>}
       */
      sizeOf: (key: string) => resolveSize(get(key)),

      /**
       * Show an instance
       *
       * @param {string} key - the instance key
       */
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
  }, [maxHiddenItems, maxHiddenItemsSizeBytes, reset]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  return cache;
}
