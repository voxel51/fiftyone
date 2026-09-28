/**
 * A tiny keyed external store: many independent values, each addressed by a
 * key, each with its own subscriber set.
 *
 * The grid's footer chrome is a sibling of the tile that owns the data it
 * draws — the presented frame, the episode's extent — so the two cannot pass
 * it through React. These stores are that seam, in the shape `useSyncExternal
 * Store` wants: a snapshot getter, a per-key subscribe, and a publisher the
 * owner calls.
 *
 * `skipUnchanged` short-circuits a publish that would re-notify with a value
 * equal to the one already held. Supply it wherever values are compared cheaply
 * and republished often; without it every republish wakes every subscriber.
 */
export function createKeyedExternalStore<T>(options?: {
  readonly skipUnchanged?: (previous: T, next: T) => boolean;
}) {
  const values = new Map<string, T>();
  const listeners = new Map<string, Set<() => void>>();
  const skipUnchanged = options?.skipUnchanged;

  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener();
  };

  return {
    /** Publishes `value` for `key`, waking that key's subscribers. */
    publish(key: string, value: T): void {
      if (values.has(key) && skipUnchanged?.(values.get(key) as T, value)) {
        return;
      }
      values.set(key, value);
      notify(key);
    },

    /** Returns a stable snapshot for `key`, or `null` when nothing is held. */
    get(key: string): T | null {
      return values.get(key) ?? null;
    },

    /** Drops `key`'s value, waking its subscribers. A no-op when unset. */
    release(key: string): void {
      if (!values.delete(key)) return;
      notify(key);
    },

    /** Subscribes to changes for one key. */
    subscribe(key: string, listener: () => void): () => void {
      const keyListeners = listeners.get(key) ?? new Set<() => void>();
      keyListeners.add(listener);
      listeners.set(key, keyListeners);
      return () => {
        if (listeners.get(key) !== keyListeners) return;
        keyListeners.delete(listener);
        if (keyListeners.size === 0) listeners.delete(key);
      };
    },

    /** Clears everything between tests, waking subscribers before dropping. */
    resetForTests(): void {
      values.clear();
      try {
        for (const keyListeners of listeners.values()) {
          for (const listener of keyListeners) listener();
        }
      } finally {
        listeners.clear();
      }
    },
  };
}
