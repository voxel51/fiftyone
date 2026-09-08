import type { ByteClient, ByteSourceDescriptor } from "../../../query/bytes";
import { byteSourceAccessKey } from "../../../query/bytes";
import {
  ByteClientReadable,
  type McapChunkReadDebugLog,
} from "./byte-readable";
import type { McapIndexedReaderLike, McapReaderFactory } from "./types";

/**
 * Lazy cache for initialized MCAP readers keyed by source identity.
 */
export interface McapReaderStore {
  dispose(): void;
  get(source: ByteSourceDescriptor): Promise<McapIndexedReaderLike>;
}

/**
 * Dependencies used to construct an MCAP reader store.
 */
export interface CreateMcapReaderStoreOptions {
  readonly byteClient: ByteClient;
  readonly debugChunkReads?: boolean;
  readonly logChunkRead?: (entry: McapChunkReadDebugLog) => void;
  readonly readerFactory: McapReaderFactory;
  readonly readSignal?: { readonly current: AbortSignal | null };
}

/**
 * Owns lazy MCAP reader initialization and per-source reader lifetime.
 */
export function createMcapReaderStore({
  byteClient,
  debugChunkReads,
  logChunkRead,
  readerFactory,
  readSignal,
}: CreateMcapReaderStoreOptions): McapReaderStore {
  const readers = new Map<string, Promise<McapIndexedReaderLike>>();
  const resolvedReaders = new Set<McapIndexedReaderLike>();
  let disposed = false;

  return {
    dispose() {
      disposed = true;
      for (const reader of resolvedReaders) {
        reader.dispose?.();
      }
      resolvedReaders.clear();
      readers.clear();
    },

    get(source) {
      if (disposed) {
        return Promise.reject(new Error("MCAP reader store is disposed"));
      }
      const key = byteSourceAccessKey(source);
      let reader = readers.get(key);

      if (!reader) {
        reader = readerFactory(
          source,
          new ByteClientReadable(source, byteClient, {
            debugChunkReads,
            logChunkRead,
            readSignal,
          }),
        )
          .then((resolved) => {
            if (disposed) {
              resolved.dispose?.();
            } else {
              resolvedReaders.add(resolved);
            }
            return resolved;
          })
          .catch((error) => {
            readers.delete(key);
            throw error;
          });
        readers.set(key, reader);
      }

      return reader;
    },
  };
}
