/**
 * In-memory cache which maps features to their status.
 */
export class FeatureCache {
  private readonly cache: Record<string, boolean> = {};

  /**
   * Returns whether the given feature is in the cache.
   *
   * @param feature Feature identifier
   * @returns true if the feature is in the cache, else false
   */
  public hasFeature(feature: string): boolean {
    return Object.keys(this.cache).includes(feature);
  }

  /**
   * Returns whether the given feature is enabled.
   *
   * @param feature Feature identifier
   * @returns true if the feature is enabled, else false
   */
  public isFeatureEnabled(feature: string): boolean {
    return !!this.cache[feature];
  }

  /**
   * Set the status of a feature.
   *
   * @param feature Feature identifier
   * @param enabled Feature status
   */
  public setFeature(feature: string, enabled: boolean): void {
    this.cache[feature] = enabled;
  }

  /**
   * Clear the cache.
   */
  public clear(): void {
    const keys = Object.keys(this.cache);
    for (const key of keys) {
      delete this.cache[key];
    }
  }
}
