// TODO: implement the OPFS cache integration.

/**
 * Scaffold for the worker's OPFS-backed byte cache.
 */
export class OPFSCache {
  /**
   * Returns cached bytes for a cache key.
   */
  async get(_cacheKey: string): Promise<Uint8Array | undefined> {
    throw new Error("Not implemented");
  }

  /**
   * Stores bytes for a cache key.
   */
  async put(_cacheKey: string, _bytes: Uint8Array): Promise<void> {
    throw new Error("Not implemented");
  }

  /**
   * Clears the cache scaffold.
   */
  async clear(): Promise<void> {
    throw new Error("Not implemented");
  }
}
