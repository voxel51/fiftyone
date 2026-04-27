// TODO: implement the Origin Private File System (OPFS) cache integration.

/**
 * Scaffold for the worker's OPFS-backed byte cache.
 */
export abstract class OPFSCache {
  /**
   * Returns cached bytes for a cache key.
   */
  abstract get(cacheKey: string): Promise<Uint8Array | undefined>;

  /**
   * Stores bytes for a cache key.
   */
  abstract put(cacheKey: string, bytes: Uint8Array): Promise<void>;

  /**
   * Clears the cache scaffold.
   */
  abstract clear(): Promise<void>;
}
