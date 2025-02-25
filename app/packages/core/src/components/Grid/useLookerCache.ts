import type * as fos from "@fiftyone/state";
import { LRUCache } from "lru-cache";
import { useEffect, useMemo } from "react";
import { gridActivePathsLUT } from "../Sidebar/useDetectNewActiveLabelFields";

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
>({
  maxHiddenItems,
  maxHiddenItemsSizeBytes,
  onSet,
  reset,
}: {
  maxHiddenItems: number;
  maxHiddenItemsSizeBytes: number;
  onSet?: (key: string) => void;
  reset: string;
}) {
  const cache = useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    const loaded = new LRUCache<string, Entry<T>>({
      dispose: (entry, key) => {
        if (!entry.dispose) return;
        entry.instance.destroy();
        gridActivePathsLUT.delete(key);
      },
      max: maxHiddenItems,
      maxSize: maxHiddenItemsSizeBytes,
      noDisposeOnSet: true,
      sizeCalculation: (entry) => {
        return entry.instance.getSizeBytesEstimate();
      },
    });

    // an intermediate mapping until the "load" event
    // "load" must occur before requesting the size bytes estimate
    const loading = new Map<string, T>();

    // visible items are excluded from LRU cache
    const visible = new Map<string, T>();

    const get = (key: string) =>
      visible.get(key) ?? loaded.get(key)?.instance ?? loading.get(key);

    const hide = (key?: string) => {
      if (!key) {
        for (const key of visible.keys()) hide(key);
        return;
      }

      const instance = visible.get(key);
      visible.delete(key);
      if (!instance) {
        return;
      }

      if (instance.loaded) {
        !loaded.has(key) && loaded.set(key, { dispose: true, instance });
        return;
      }

      instance && setLoading(key, instance);
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
      set: (key: string, instance: T) => {
        visible.set(key, instance);
        onSet?.(key);
      },

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

      /**
       * Update the instance
       *
       * @param {string} key - the instance key
       * @param {T} instance - the instance
       * @returns {T} the instance
       */
      update: (key: string, instance: T) => {
        if (!loaded.has(key)) {
          throw new Error("no instance loaded");
        }
        loaded.set(key, { dispose: true, instance });
      },
    };
  }, [maxHiddenItems, maxHiddenItemsSizeBytes, onSet, reset]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  return cache;
}
