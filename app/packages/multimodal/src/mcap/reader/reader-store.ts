import type { ByteResourceClient } from "../../client";
import { byteSourceCacheKey } from "../../client/resources/cache";
import type { McapSourceDescriptor } from "../types";
import { ByteClientReadable } from "./byte-readable";
import type { McapIndexedReaderLike, McapReaderFactory } from "./types";

/**
 * Lazy cache for initialized MCAP readers keyed by source identity.
 */
export interface McapReaderStore {
  dispose(): void;
  get(source: McapSourceDescriptor): Promise<McapIndexedReaderLike>;
}

/**
 * Dependencies used to construct an MCAP reader store.
 */
export interface CreateMcapReaderStoreOptions {
  readonly byteClient: ByteResourceClient;
  readonly readerFactory: McapReaderFactory;
}

/**
 * Owns lazy MCAP reader initialization and per-source reader lifetime.
 */
export function createMcapReaderStore({
  byteClient,
  readerFactory,
}: CreateMcapReaderStoreOptions): McapReaderStore {
  const readers = new Map<string, Promise<McapIndexedReaderLike>>();

  return {
    dispose() {
      readers.clear();
    },

    get(source) {
      const key = byteSourceCacheKey(source);
      let reader = readers.get(key);

      if (!reader) {
        reader = readerFactory(
          source,
          new ByteClientReadable(source, byteClient)
        ).catch((error) => {
          readers.delete(key);
          throw error;
        });
        readers.set(key, reader);
      }

      return reader;
    },
  };
}
