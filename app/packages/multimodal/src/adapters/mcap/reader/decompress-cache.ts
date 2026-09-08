import type { McapTypes } from "@mcap/core";
import type {
  McapDecompressedChunkCache,
  McapDecompressedChunkKey,
} from "./decompressed-chunk-cache";

export interface CachedMcapDecompressHandlersOptions {
  /** The caller owns this cache and must dispose it with the reader. */
  readonly cache: McapDecompressedChunkCache;
  /** Static identity for IReadable implementations without source context. */
  readonly fallbackSourceKey?: string;
}

/**
 * Routes @mcap/core indexed-reader decompressions through an owned shared
 * cache. The patched dependency supplies the exact chunk payload range even
 * though parseChunk() copies the payload before invoking this handler.
 */
export function createCachedMcapDecompressHandlers(
  handlers: McapTypes.DecompressHandlers,
  options: CachedMcapDecompressHandlersOptions,
): McapTypes.DecompressHandlers {
  const entries = Object.entries(handlers) as Array<
    [string, McapTypes.DecompressHandlers[string]]
  >;

  return Object.fromEntries(
    entries.map(([compression, decompress]) => [
      compression,
      (
        buffer: Uint8Array,
        decompressedSize: bigint,
        context?: McapTypes.ChunkDecompressionContext,
      ) => {
        if (context) {
          const key = decompressedChunkKeyForContext({
            buffer,
            compression,
            context,
            decompressedSize,
            sourceKey: context.sourceIdentity ?? options.fallbackSourceKey,
          });
          if (key) {
            return options.cache.getOrLoad(key, () => ({
              bytes: decompress(buffer, decompressedSize, context),
            })).bytes;
          }
        }

        return options.cache.loadUnkeyed(
          {
            decompressedSize,
          },
          () => ({
            bytes: decompress(buffer, decompressedSize, context),
          }),
        ).bytes;
      },
    ]),
  );
}

function decompressedChunkKeyForContext({
  buffer,
  compression,
  context,
  decompressedSize,
  sourceKey,
}: {
  readonly buffer: Uint8Array;
  readonly compression: string;
  readonly context: McapTypes.ChunkDecompressionContext;
  readonly decompressedSize: bigint;
  readonly sourceKey?: string;
}): McapDecompressedChunkKey | undefined {
  if (
    context.compression !== compression ||
    context.uncompressedSize !== decompressedSize ||
    context.compressedDataLength !== BigInt(buffer.byteLength) ||
    context.chunkLength < context.compressedDataLength ||
    context.compressedDataStartOffset < context.chunkStartOffset ||
    context.compressedDataStartOffset + context.compressedDataLength !==
      context.chunkStartOffset + context.chunkLength
  ) {
    // Context only feeds the cache identity. Preserve decompression when an
    // older or custom reader supplies incomplete/inconsistent metadata.
    return undefined;
  }

  if (sourceKey === undefined || sourceKey.length === 0) {
    return undefined;
  }

  return {
    compressedLength: context.compressedDataLength,
    compressedOffset: context.compressedDataStartOffset,
    compression,
    decompressedSize,
    sourceKey,
  };
}
