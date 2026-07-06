import { LRUCache } from "lru-cache";
import type { McapTypes } from "@mcap/core";

const DEFAULT_DECOMPRESSED_CHUNK_CACHE_SIZE_BYTES = 64 * 1024 * 1024;

export function createCachedMcapDecompressHandlers(
  handlers: McapTypes.DecompressHandlers,
  maxSizeBytes = DEFAULT_DECOMPRESSED_CHUNK_CACHE_SIZE_BYTES,
): McapTypes.DecompressHandlers {
  const cache = new LRUCache<string, Uint8Array>({
    maxSize: Math.max(1, maxSizeBytes),
    sizeCalculation: (value) => Math.max(1, value.byteLength),
  });
  const bufferIds = new WeakMap<ArrayBufferLike, number>();
  let nextBufferId = 0;

  const entries = Object.entries(handlers) as Array<
    [string, McapTypes.DecompressHandlers[string]]
  >;

  return Object.fromEntries(
    entries.map(([compression, decompress]) => [
      compression,
      (buffer: Uint8Array, decompressedSize: bigint) => {
        const key = decompressCacheKey({
          buffer,
          bufferIds,
          compression,
          decompressedSize,
          nextBufferId: () => ++nextBufferId,
        });
        const cached = cache.get(key);
        if (cached) return cached;

        const decompressed = decompress(buffer, decompressedSize);
        cache.set(key, decompressed);
        return decompressed;
      },
    ]),
  );
}

function decompressCacheKey({
  buffer,
  bufferIds,
  compression,
  decompressedSize,
  nextBufferId,
}: {
  readonly buffer: Uint8Array;
  readonly bufferIds: WeakMap<ArrayBufferLike, number>;
  readonly compression: string;
  readonly decompressedSize: bigint;
  readonly nextBufferId: () => number;
}): string {
  let bufferId = bufferIds.get(buffer.buffer);
  if (bufferId === undefined) {
    bufferId = nextBufferId();
    bufferIds.set(buffer.buffer, bufferId);
  }

  return [
    compression,
    bufferId,
    buffer.byteOffset,
    buffer.byteLength,
    decompressedSize.toString(),
  ].join(":");
}
