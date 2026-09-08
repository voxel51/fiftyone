import type { PointCloudRenderChannelPayload } from "../../../ir";

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

/**
 * Coalesces unsigned cache-owned work. A caller-scoped signal always gets an
 * independent promise so one consumer cannot abort another consumer's read.
 */
export function readPointCloudChannelWithCache(
  cache: Map<string, Promise<PointCloudRenderChannelPayload>>,
  key: string,
  signal: AbortSignal | undefined,
  read: () => Promise<PointCloudRenderChannelPayload>,
): Promise<PointCloudRenderChannelPayload> {
  if (signal) return read();
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = read().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  evictOldestPointCloudChannels(cache);
  return pending;
}
