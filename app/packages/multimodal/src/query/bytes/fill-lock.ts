import { serializeCacheKey } from "../cache-utils";
import { byteSourceCacheKey } from "./cache";
import type { ByteFillLockManager, ByteRangeReadRequest } from "./types";

/**
 * Cross-context single-flight for network block fills.
 *
 * Every worker lane (and the main-thread prewarm client) owns a private
 * in-memory cache and a private in-flight map, so identical block fills
 * racing across contexts each pay a network fetch — the persistent layer
 * only helps after the first fetch has landed. Web Locks are origin-scoped
 * like the Cache API, so an exclusive lock per fill shape turns that race
 * into one fetch plus persistent-cache handoffs, across lanes and even
 * across tabs playing the same source.
 */

const FILL_LOCK_PREFIX = "fo-multimodal-fill-v1";

/**
 * Returns the runtime `navigator.locks` manager when available (secure
 * contexts, including dedicated workers), else undefined.
 */
export function defaultByteFillLockManager(): ByteFillLockManager | undefined {
  const locks = (globalThis as { navigator?: { locks?: ByteFillLockManager } })
    .navigator?.locks;

  return locks && typeof locks.request === "function" ? locks : undefined;
}

/**
 * Lock name for one fill shape, aligned with persistent-cache entry
 * identity (content id + discovered size + exact fill range) so contexts
 * that would share a persistent entry contend on the same lock.
 */
export function byteFillLockName(request: ByteRangeReadRequest): string {
  return serializeCacheKey([
    FILL_LOCK_PREFIX,
    byteSourceCacheKey(request.source),
    request.source.sizeBytes ?? "size-unknown",
    request.range.offset.toString(),
    request.range.length.toString(),
  ]);
}
