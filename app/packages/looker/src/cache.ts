import { LRUCache } from "lru-cache";
import type {
  FrameLooker,
  ImaVidLooker,
  ImageLooker,
  VideoLooker,
} from "./lookers";

type CacheCallback = (key: string) => void;

export interface CacheOptions {
  maxHiddenItems: number;
  maxHiddenItemsSizeBytes: number;
  onDispose?: CacheCallback;
  onSet?: CacheCallback;
}

interface Instance extends EventTarget {
  loaded: boolean;
  destroy: () => void;
  getSizeBytesEstimate: () => number;
}

export type Lookers = FrameLooker | ImageLooker | ImaVidLooker | VideoLooker;

/**
 * Creates a LRU cache with exclusionary shown and frozen states
 *
 * @param {number} options.maxHiddenItems the max number hidden instances
 * @param {number} options.maxHiddenItemsSizeBytes the max bytes of hidden instances
 * @param {CacheCallback} options.onDispose an optional on dispose instance callback
 * @param {CacheCallback} options.onDispose optional on set instance callback
 * @returns an exclusionary LRU cache
 */
export const createCache = <T extends Instance | Lookers = Lookers>(
  options: CacheOptions
) => {
  const { maxHiddenItems, maxHiddenItemsSizeBytes, onDispose, onSet } = options;

  // shown instances
  const shown = new Map<string, T>();

  // hidden instances, i.e. instances that do not yet have a size estimate
  const pending = new Map<string, T>();

  // hidden instances with a size estimate
  const hidden = new LRUCache<string, T>({
    dispose: (instance, key) => {
      if (shown.has(key)) return;
      instance.destroy();
      onDispose?.(key);
    },
    max: maxHiddenItems,
    maxSize: maxHiddenItemsSizeBytes,
    noDisposeOnSet: true,
    sizeCalculation: (instance) => instance.getSizeBytesEstimate(),
  });

  // frozen instances, i.e. neither shown or hidden
  const frozen = new Map<string, T>();

  const get = (key: string) =>
    frozen.get(key) ?? hidden.get(key) ?? pending.get(key) ?? shown.get(key);

  const hide = (key?: string) => {
    if (!key) {
      for (const key of shown.keys()) hide(key);
      return;
    }

    const instance = shown.get(key) ?? frozen.get(key);
    shown.delete(key);
    frozen.delete(key);
    if (!instance) {
      return;
    }

    if (instance.loaded) {
      !hidden.has(key) && hidden.set(key, instance);
      return;
    }

    instance && setLoading(key, instance);
  };

  const setLoading = (key: string, instance: T) => {
    const onReady = () => {
      if (pending.has(key)) {
        hidden.set(key, instance);
        pending.delete(key);
      }

      instance.removeEventListener("load", onReady);
    };

    instance.addEventListener("load", onReady);
    pending.set(key, instance);
  };

  return {
    /** TESTING ONLY **/
    frozen,
    /** TESTING ONLY **/
    hidden,
    /** TESTING ONLY **/
    pending,
    /** TESTING ONLY **/
    shown,

    /**
     * Delete all instances
     */
    delete: () => {
      destroy(frozen, onDispose);
      hidden.clear();
      destroy(pending, onDispose);
      destroy(shown, onDispose);
    },

    /**
     * Delete hidden instances
     */
    empty: () => {
      hidden.clear();
      destroy(pending, onDispose);
    },

    /**
     * Get an instance
     *
     * @param {string} key - the instance key
     * @returns {T} the instance
     */
    get,

    /**
     * Hide an instance. If a key is not provided, all instances are hidden
     *
     * @param {string=} key - an optional key
     */
    hide,

    /**
     * Freeze shown instances. A frozen instance is neither shown or hidden
     */
    freeze: () => {
      for (const [key, value] of shown.entries()) {
        frozen.set(key, value);
        shown.delete(key);
      }
    },

    /**
     * Determine if an instance is shown
     *
     * @param {string} key - the instance key
     * @returns {boolean} whether it is shown
     */
    isShown: (key: string) => shown.has(key),

    /**
     * Set an instance. The initial state of the instance is always shown. If
     * the instance was frozen, it is unfrozen
     *
     * @param {string} key - the instance key
     * @param {T} instance - the instance
     * @returns {T} the instance
     */
    set: (key: string, instance: T) => {
      shown.set(key, instance);
      frozen.delete(key);
      hidden.delete(key);
      pending.delete(key);
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
      const instance = get(key);
      instance && shown.set(key, instance);
      frozen.delete(key);
      hidden.delete(key);
      pending.delete(key);
    },

    /**
     * Hide frozen instances
     */
    unfreeze: () => {
      for (const key of frozen.keys()) hide(key);
    },
  };
};

const destroy = <T extends Instance | Lookers = Lookers>(
  map: Map<string, T>,
  onDispose?: CacheCallback
) => {
  for (const [key, instance] of map.entries()) {
    instance.destroy();
    onDispose?.(key);
  }
  map.clear();
};

const resolveSize = <T extends Instance | Lookers = Lookers>(looker?: T) => {
  if (!looker) {
    throw new Error("not found");
  }

  if (looker.loaded) {
    return Promise.resolve(looker.getSizeBytesEstimate());
  }

  return new Promise<number>((resolve) => {
    const load = () => {
      looker.removeEventListener("load", load);
      resolve(looker.getSizeBytesEstimate());
    };

    looker.addEventListener("load", load);
  });
};
