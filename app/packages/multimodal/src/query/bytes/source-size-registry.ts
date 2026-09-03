import { parseByteSize } from "./byte-size";
import { byteSourceCacheKey } from "./cache";
import type { ByteSourceDescriptor } from "./types";

/**
 * Sizes learned from responses a read already had to make.
 *
 * A manifest derived from a stored reference carries no size, because import
 * records none - and both block-fill widening and successor readahead refuse
 * to act without one, because neither can find a block's end. So an unsized
 * source reads at whatever exact shape its consumer asked for, one request at
 * a time with nothing in flight behind it, which is the one thing a remote
 * object store cannot serve fast enough to keep a decoder fed.
 *
 * An HTTP range read reports the object's total in its `Content-Range`, so the
 * first read of a source already knows the size; nothing carried that fact to
 * the second. This does.
 */
export interface ByteSourceSizeRegistry {
  /** Completes a request's source with a size an earlier read resolved. */
  complete<T extends { readonly source: ByteSourceDescriptor }>(request: T): T;
  /** The size an earlier read resolved for these contents, if any. */
  recall(source: ByteSourceDescriptor): string | undefined;
  /** Records the size a reader resolved, if it resolved one. */
  remember(source: ByteSourceDescriptor): void;
}

/** Bounded: a client browses more objects than it ever reads twice. */
const MAX_TRACKED_SOURCES = 4096;

/**
 * Tracks discovered sizes for one client's reads.
 *
 * Scoped to a client rather than to the module, matching its in-memory cache:
 * what crosses contexts is the persistent layer, keyed the same way. Keyed by
 * content rather than by consumer, so that within a client the first read of
 * an object sizes it for every episode that shares it - and every episode of a
 * LeRobot source shares its video files and shards.
 */
export function createByteSourceSizeRegistry(): ByteSourceSizeRegistry {
  const discovered = new Map<string, string>();

  const recall = (source: ByteSourceDescriptor) =>
    source.sizeBytes ?? discovered.get(byteSourceCacheKey(source));

  return {
    complete(request) {
      if (request.source.sizeBytes !== undefined) {
        return request;
      }

      const sizeBytes = discovered.get(byteSourceCacheKey(request.source));
      return sizeBytes === undefined
        ? request
        : { ...request, source: { ...request.source, sizeBytes } };
    },

    recall,

    remember(source) {
      const { sizeBytes } = source;
      if (sizeBytes === undefined || parseByteSize(sizeBytes) === undefined) {
        return;
      }

      const key = byteSourceCacheKey(source);
      // Re-inserted so iteration order is least-recently-resolved first.
      discovered.delete(key);
      discovered.set(key, sizeBytes);
      if (discovered.size > MAX_TRACKED_SOURCES) {
        const oldest = discovered.keys().next().value;
        if (oldest !== undefined) {
          discovered.delete(oldest);
        }
      }
    },
  };
}
