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

const destroy = <T extends Lookers | fos.Lookers = fos.Lookers>(
  map: Map<string, T>
) => {
  for (const instance of map.values()) instance.destroy();
  map.clear();
};

export default function useLookerCache<
  T extends Lookers | fos.Lookers = fos.Lookers
>({
  maxHiddenItems,
  maxHiddenItemsSizeBytes,
  onDispose,
  onSet,
  reset,
}: {
  maxHiddenItems: number;
  maxHiddenItemsSizeBytes: number;
  onDispose?: (key: string) => void;
  onSet?: (key: string) => void;
  reset: string;
}) {
  const cache = useMemo(() => {
    /** CLEAR CACHE WHEN reset CHANGES */
    reset;
    /** CLEAR CACHE WHEN reset CHANGES */

    // hidden instances with a size estimate
    const hidden = new LRUCache<string, Entry<T>>({
      dispose: (entry, key) => {
        if (!entry.dispose) return;
        entry.instance.destroy();
        onDispose?.(key);
      },
      max: maxHiddenItems,
      maxSize: maxHiddenItemsSizeBytes,
      noDisposeOnSet: true,
      sizeCalculation: (entry) => {
        return entry.instance.getSizeBytesEstimate();
      },
    });

    // hidden instances, i.e. instances that do not yet have a size estimate
    const pending = new Map<string, T>();

    // frozen instances, i.e. neither shown or hidden
    const frozen = new Map<string, T>();

    // shown instances
    const shown = new Map<string, T>();

    const get = (key: string) =>
      shown.get(key) ?? hidden.get(key)?.instance ?? pending.get(key);

    const hide = (key?: string) => {
      if (!key) {
        for (const key of shown.keys()) hide(key);
        return;
      }

      const instance = shown.get(key);
      shown.delete(key);
      if (!instance) {
        return;
      }

      if (instance.loaded) {
        !hidden.has(key) && hidden.set(key, { dispose: true, instance });
        return;
      }

      instance && setLoading(key, instance);
    };

    const setLoading = (key: string, instance: T) => {
      const onReady = () => {
        if (pending.has(key)) {
          hidden.set(key, { dispose: true, instance });
          pending.delete(key);
        }

        instance.removeEventListener("load", onReady);
      };

      instance.addEventListener("load", onReady);
      pending.set(key, instance);
    };

    return {
      frozen,
      hidden,
      pending,
      shown,

      /**
       * Delete all instances
       */
      delete: () => {
        destroy(frozen);
        hidden.clear();
        destroy(pending);
        destroy(shown);
      },

      /**
       * Delete hidden instances
       */
      empty: () => {
        for (const it of pending.keys()) {
          pending.get(it)?.destroy();
          pending.delete(it);
        }
        for (const it of hidden.keys()) hidden.delete(it);
      },

      /**
       * Get an instance
       *
       * @param {string} key - the instance key
       * @returns {T} the instance
       */
      get,

      /**
       * Get a frozen instance
       *
       * @param {string} key - the instance key
       * @returns {T} the instance
       */
      getFrozen: (key: string) => frozen.get(key),

      /**
       * Hide an instance. If a key is not provided, all instances are hidden
       *
       * @param {string=} key - an optional key
       */
      hide,

      /**
       * Clear shown instances and move them to a frozen state where they are
       * neither shown or hidden
       */
      freeze: () => {
        for (const [key, value] of shown.entries()) {
          frozen.set(key, value);
          shown.delete(key);
        }
      },

      /**
       * Determine an instance's visibility
       *
       * @param {string} key - the instance key
       * @returns {boolean} whether it is shown
       */
      isShown: (key: string) => shown.has(key),

      /**
       * Set an instance. The initial state of the instance is always shown
       *
       * @param {string} key - the instance key
       * @param {T} instance - the instance
       * @returns {T} the instance
       */
      set: (key: string, instance: T) => {
        shown.set(key, instance);
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
        const entry = hidden.get(key);
        if (entry) {
          entry.dispose = false;
        }

        const instance = get(key);
        pending.delete(key);
        hidden.delete(key);
        instance && shown.set(key, instance);
      },

      /**
       * Hide frozen instances
       */
      unfreeze: () => {
        for (const key of frozen.keys()) hide(key);
      },
    };
  }, [maxHiddenItems, maxHiddenItemsSizeBytes, onDispose, onSet, reset]);

  // delete cache during cleanup
  useEffect(() => () => cache.delete(), [cache]);

  return cache;
}
