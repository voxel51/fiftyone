import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { safeNumber } from "./bigint-utils";
import { serializeCacheKey } from "../cache-utils";
import { byteSourceAccessKey } from "./cache";
import { parseByteSize } from "./byte-size";
import type {
  ByteClient,
  ByteCacheLayers,
  ByteRange,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteReadDebugLog,
} from "./types";

/**
 * Default byte-cache fill block size from explicit source metadata.
 */
export function defaultByteCacheBlockSizeBytes(
  request: ByteRangeReadRequest,
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
  caches: ByteCacheLayers,
): ByteClient {
  const pendingByteReads = new Map<string, Promise<ByteRangeReadResult>>();

  return {
    async stat(source) {
      return reader.stat?.(source);
    },

    async readBytes(request) {
      const startMs = byteReadNowMs();
      // Widen small reads to cacheable blocks when the source size is known.
      let fillRequest = request;
      if (request.cachePolicy?.blockFill !== false) {
        const blockSizeBytes =
          typeof caches.blockSizeBytes === "function"
            ? caches.blockSizeBytes(request)
            : (caches.blockSizeBytes ??
              defaultByteCacheBlockSizeBytes(request));

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
        logByteRead(caches, {
          cacheResult: "fill-hit",
          fillRequest,
          request,
          result: cachedFill,
          startMs,
        });
        return sliceByteRangeResult(cachedFill, request.range);
      }

      if (
        fillRequest.range.offset !== request.range.offset ||
        fillRequest.range.length !== request.range.length
      ) {
        const cachedRequest = await caches.memory.get(request);
        if (cachedRequest) {
          logByteRead(caches, {
            cacheResult: "request-hit",
            fillRequest,
            request,
            result: cachedRequest,
            startMs,
          });
          return cachedRequest;
        }
      }

      // Exact one-off reads stay out of the persistent layer: their ranges
      // are not deterministic shapes, so they would fragment it with entries
      // the block/chunk read paths can never match again.
      const persistent =
        request.cachePolicy?.blockFill === false
          ? undefined
          : caches.persistent || undefined;

      const persistedFill = await persistent?.get(fillRequest);
      if (persistedFill) {
        await caches.memory.put(persistedFill);
        logByteRead(caches, {
          cacheResult: "persistent-hit",
          fillRequest,
          request,
          result: persistedFill,
          startMs,
        });
        return sliceByteRangeResult(persistedFill, request.range);
      }

      // In-flight request coalescing follows the active access URL, while the
      // durable byte cache above follows stable sourceId content identity.
      const fillKey = byteRangeAccessKey(fillRequest);
      let fill = pendingByteReads.get(fillKey);
      const cacheResult = fill ? "coalesced" : "fetched";
      if (!fill) {
        fill = reader
          .readBytes(fillRequest)
          .then(async (result) => {
            await caches.memory.put(result);
            // Persisting must not delay the read; the entry lands for the
            // next context (or reload) to hit.
            void persistent?.put(result).catch(() => undefined);

            return result;
          })
          .finally(() => {
            pendingByteReads.delete(fillKey);
          });
        pendingByteReads.set(fillKey, fill);
      }

      const result = await fill;
      logByteRead(caches, {
        cacheResult,
        fillRequest,
        request,
        result,
        startMs,
      });
      return sliceByteRangeResult(result, request.range);
    },
  };
}

function logByteRead(
  caches: ByteCacheLayers,
  {
    cacheResult,
    fillRequest,
    request,
    result,
    startMs,
  }: {
    readonly cacheResult: ByteReadDebugLog["cacheResult"];
    readonly fillRequest: ByteRangeReadRequest;
    readonly request: ByteRangeReadRequest;
    readonly result: ByteRangeReadResult;
    readonly startMs: number;
  },
) {
  if (!caches.debug?.enabled) return;

  const entry: ByteReadDebugLog = {
    blockFill:
      fillRequest.range.offset !== request.range.offset ||
      fillRequest.range.length !== request.range.length,
    cacheResult,
    durationMs: Number((byteReadNowMs() - startMs).toFixed(1)),
    fetchedBytes: cacheResult === "fetched" ? result.bytes.byteLength : 0,
    fillLength: fillRequest.range.length.toString(),
    fillOffset: fillRequest.range.offset.toString(),
    readProfile: request.source.readProfile,
    requestedLength: request.range.length.toString(),
    requestedOffset: request.range.offset.toString(),
    returnedBytes: safeNumber(request.range.length),
    sourceId: request.source.sourceId,
  };

  (caches.debug.log ?? defaultByteReadDebugLogger)(entry);
}

function defaultByteReadDebugLogger(entry: ByteReadDebugLog): void {
  console.log("[multimodal] byte read", entry);
}

function byteReadNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
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
  range: ByteRange,
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
