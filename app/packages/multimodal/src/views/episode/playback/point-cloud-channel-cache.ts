/** Maximum number of point-cloud channel reads retained per cache. */
export const POINT_CLOUD_CHANNEL_CACHE_LIMIT = 64;

/** Builds the shared identity for one projected point-cloud channel. */
export function pointCloudChannelKey(
  sourceKey: string,
  stream: string,
  contentTimeNs: bigint,
  samplePlanKey: string,
  activeColorBy: string,
): string {
  return [sourceKey, stream, contentTimeNs, samplePlanKey, activeColorBy].join(
    "\0",
  );
}

/** Evicts oldest inserted point-cloud channels until the cache is bounded. */
export function evictOldestPointCloudChannels<Value>(
  cache: Map<string, Value>,
): void {
  while (cache.size > POINT_CLOUD_CHANNEL_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    cache.delete(oldest);
  }
}
