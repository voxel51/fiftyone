import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { serializeCacheKey } from "../cache-utils";
import { byteSourceAccessKey } from "./cache";
import { parseByteSize } from "./byte-size";
import type {
  ByteClient,
  ByteCacheLayers,
  ByteRange,
  ByteRangeReadRequest,
  ByteRangeReadResult,
} from "./types";

/**
 * Default byte-cache fill block size from explicit source metadata.
 */
export function defaultByteCacheBlockSizeBytes(
  request: ByteRangeReadRequest
): number {
  return request.source.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
    ? DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES
    : DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES;
}

/**
 * Wraps a byte reader with raw byte cache lookups, block fills, and request
 * coalescing.
 */
export function createCachedByteClient(
  reader: ByteClient,
  caches: ByteCacheLayers
): ByteClient {
  const pendingByteReads = new Map<string, Promise<ByteRangeReadResult>>();

  return {
    async stat(source) {
      return reader.stat?.(source);
    },

    async readBytes(request) {
      // Widen small reads to cacheable blocks when the source size is known.
      let fillRequest = request;
      if (request.cachePolicy?.blockFill !== false) {
        const blockSizeBytes =
          typeof caches.blockSizeBytes === "function"
            ? caches.blockSizeBytes(request)
            : caches.blockSizeBytes ?? defaultByteCacheBlockSizeBytes(request);

        if (
          blockSizeBytes !== undefined &&
          Number.isSafeInteger(blockSizeBytes) &&
          blockSizeBytes > 0 &&
          request.range.length < BigInt(blockSizeBytes)
        ) {
          const sourceSize = parseByteSize(request.source.sizeBytes);

          if (sourceSize !== undefined) {
            const blockSize = BigInt(blockSizeBytes);
            const offset = (request.range.offset / blockSize) * blockSize;
            const blockEnd = offset + blockSize;
            const end = blockEnd < sourceSize ? blockEnd : sourceSize;

            if (end >= request.range.offset + request.range.length) {
              fillRequest = {
                ...request,
                range: {
                  length: end - offset,
                  offset,
                },
              };
            }
          }
        }
      }

      const cachedFill = await caches.memory.get(fillRequest);
      if (cachedFill) {
        return sliceByteRangeResult(cachedFill, request.range);
      }

      if (
        fillRequest.range.offset !== request.range.offset ||
        fillRequest.range.length !== request.range.length
      ) {
        const cachedRequest = await caches.memory.get(request);
        if (cachedRequest) {
          return cachedRequest;
        }
      }

      // In-flight request coalescing follows the active access URL, while the
      // durable byte cache above follows stable sourceId content identity.
      const fillKey = byteRangeAccessKey(fillRequest);
      let fill = pendingByteReads.get(fillKey);
      if (!fill) {
        fill = reader
          .readBytes(fillRequest)
          .then(async (result) => {
            await caches.memory.put(result);

            return result;
          })
          .finally(() => {
            pendingByteReads.delete(fillKey);
          });
        pendingByteReads.set(fillKey, fill);
      }

      const result = await fill;
      return sliceByteRangeResult(result, request.range);
    },
  };
}

function byteRangeAccessKey(request: ByteRangeReadRequest): string {
  return serializeCacheKey([
    byteSourceAccessKey(request.source),
    request.range.offset.toString(),
    request.range.length.toString(),
  ]);
}

function sliceByteRangeResult(
  result: ByteRangeReadResult,
  range: ByteRange
): ByteRangeReadResult {
  if (
    result.range.offset === range.offset &&
    result.range.length === range.length
  ) {
    return result;
  }

  const start = safeNumber(range.offset - result.range.offset);
  const end = start + safeNumber(range.length);

  return {
    bytes: result.bytes.subarray(start, end),
    range,
    source: result.source,
  };
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Byte length ${value.toString()} exceeds safe number range`
    );
  }

  return Number(value);
}
