import { byteSourceCacheKey } from "./cache";
import { monotonicNowMs } from "../../utils/monotonic-time";
import type { ByteSourceDescriptor } from "./types";

/**
 * Where a source's bytes were last actually served from.
 *
 * A manifest hands out a stable handle rather than a signed URL, because a
 * signature is minted per pod and per moment: two of them for one object
 * differ, so nothing downstream can reuse anything it already has. The
 * handle costs a hop to redeem - the hop that authorizes the read and mints
 * the signature - and paying it per range read would put that hop in front
 * of every read a demuxer makes.
 *
 * So a read remembers where it landed and the next read of the same content
 * goes straight there. One authorization covers a source's reads for as long
 * as it is valid, and correctness never depends on a hit: a location that has
 * expired or been revoked answers 403, which drops it and redeems the handle
 * again.
 *
 * Keyed by content, not by consumer, so every episode selecting from one
 * object shares the location resolved for it.
 */
export interface ByteSourceLocationRegistry {
  /** Drops a location a read has just found unusable. */
  forget(source: ByteSourceDescriptor): void;
  /** Where this content was served from, while that stays usable. */
  recall(source: ByteSourceDescriptor): string | undefined;
  /** Records where a read of this content actually landed. */
  remember(source: ByteSourceDescriptor, url: string): void;
}

/** Bounded: a client browses more objects than it reads twice. */
const MAX_TRACKED_LOCATIONS = 4096;

/**
 * How long a resolved location is reused.
 *
 * Deliberately shorter than any lifetime the server puts on a redirect, so
 * this expires first and a read does not have to discover expiry from a 403.
 * Being wrong here costs one retry, never a failed read, which is why it is a
 * constant rather than a fact threaded through the manifest.
 */
const LOCATION_LIFETIME_MS = 120_000;

/** Tracks resolved read locations for one client's reads. */
export function createByteSourceLocationRegistry(): ByteSourceLocationRegistry {
  const resolved = new Map<string, { expiresAtMs: number; url: string }>();

  return {
    forget(source) {
      resolved.delete(byteSourceCacheKey(source));
    },

    recall(source) {
      const key = byteSourceCacheKey(source);
      const entry = resolved.get(key);
      if (entry === undefined) {
        return undefined;
      }

      if (entry.expiresAtMs <= monotonicNowMs()) {
        resolved.delete(key);
        return undefined;
      }

      return entry.url;
    },

    remember(source, url) {
      // A handle that resolved to itself is not a location worth holding: the
      // read went straight to the bytes and there is no hop to skip.
      if (!url || url === source.url) {
        return;
      }

      const key = byteSourceCacheKey(source);
      // Re-inserted so iteration order is least-recently-resolved first.
      resolved.delete(key);
      resolved.set(key, {
        expiresAtMs: monotonicNowMs() + LOCATION_LIFETIME_MS,
        url,
      });
      if (resolved.size > MAX_TRACKED_LOCATIONS) {
        const oldest = resolved.keys().next().value;
        if (oldest !== undefined) {
          resolved.delete(oldest);
        }
      }
    },
  };
}
