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

/** Stable structural view of the decompression context supplied by MCAP. */
export interface McapChunkDecompressionContext {
  readonly chunkLength: bigint;
  readonly chunkStartOffset: bigint;
  readonly compressedDataLength: bigint;
  readonly compressedDataStartOffset: bigint;
  readonly compression: string;
  readonly sourceIdentity?: string;
  readonly uncompressedSize: bigint;
}

export type McapDecompressHandler = (
  buffer: Uint8Array,
  decompressedSize: bigint,
  context?: McapChunkDecompressionContext,
) => Uint8Array;

export type McapDecompressHandlers = Readonly<
  Record<string, McapDecompressHandler>
>;

/**
 * Routes @mcap/core indexed-reader decompressions through an owned shared
 * cache. The patched dependency supplies the exact chunk payload range even
 * though parseChunk() copies the payload before invoking this handler.
 */
export function createCachedMcapDecompressHandlers(
  handlers: McapDecompressHandlers,
  options: CachedMcapDecompressHandlersOptions,
): McapDecompressHandlers {
  const entries = Object.entries(handlers);

  return Object.fromEntries(
    entries.map(([compression, decompress]) => [
      compression,
      (
        buffer: Uint8Array,
        decompressedSize: bigint,
        context?: McapChunkDecompressionContext,
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
  readonly context: McapChunkDecompressionContext;
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
