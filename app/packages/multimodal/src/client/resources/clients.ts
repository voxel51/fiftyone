import { getFetchFunctionExtended } from "@fiftyone/utilities";
import { defaultDecoderRegistry, type DecoderRegistry } from "../../decoders";
import { byteRangeCacheKey, decodedOutputCacheKey } from "./cache";
import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import type {
  ByteCacheLayers,
  ByteRange,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteResourceClient,
  DecodedOutputCache,
  DecodeExecutor,
  DecodeResourceClient,
  DecodeResourceResult,
} from "./types";

const DEFAULT_HTTP_BYTE_READ_RETRIES = 2;

/**
 * Default decode executor. It runs decoder work inline on the caller thread.
 */
export const inlineDecodeExecutor: DecodeExecutor = {
  decode({ bytes, context, decoder }) {
    return decoder.decode(bytes, context);
  },
};

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
 * Creates an HTTP byte reader that sends explicit Range headers.
 */
export function createHttpByteResourceClient(
  fetchFunction?: ReturnType<typeof getFetchFunctionExtended>
): ByteResourceClient {
  return {
    async readBytes(request) {
      if (request.range.offset < 0n) {
        throw new Error("Byte range offset must be non-negative");
      }
      if (request.range.length <= 0n) {
        throw new Error("Byte range length must be positive");
      }

      const expectedLength = safeNumber(request.range.length);
      const endOffset = request.range.offset + request.range.length - 1n;
      const { headers, response: buffer } = await (
        fetchFunction ?? getFetchFunctionExtended()
      )<undefined, ArrayBuffer>({
        headers: {
          Range: `bytes=${request.range.offset.toString()}-${endOffset.toString()}`,
        },
        method: "GET",
        path: request.source.url,
        result: "arrayBuffer",
        retries: DEFAULT_HTTP_BYTE_READ_RETRIES,
      });
      const bytes = new Uint8Array(buffer);

      // Validate the HTTP range contract before trusting the returned bytes.
      const contentRange = headers?.get("Content-Range");
      if (!contentRange) {
        throw new Error(
          "Expected Content-Range header for byte-range response"
        );
      }

      const contentRangeMatch = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(
        contentRange
      );
      if (!contentRangeMatch) {
        throw new Error(`Invalid Content-Range header '${contentRange}'`);
      }

      const contentRangeStart = BigInt(contentRangeMatch[1]);
      const contentRangeEnd = BigInt(contentRangeMatch[2]);
      if (
        contentRangeStart !== request.range.offset ||
        contentRangeEnd !== request.range.offset + request.range.length - 1n ||
        safeNumber(contentRangeEnd - contentRangeStart + 1n) !== expectedLength
      ) {
        throw new Error(
          `Expected Content-Range for ${request.range.offset.toString()}-${
            request.range.offset + request.range.length - 1n
          } but received '${contentRange}'`
        );
      }

      const totalSizeBytes =
        contentRangeMatch[3] === "*" ? undefined : BigInt(contentRangeMatch[3]);
      if (totalSizeBytes !== undefined && contentRangeEnd >= totalSizeBytes) {
        throw new Error(`Invalid Content-Range header '${contentRange}'`);
      }
      if (bytes.byteLength !== expectedLength) {
        throw new Error(
          `Expected ${expectedLength} bytes but received ${bytes.byteLength}`
        );
      }

      // Preserve discovered source size so later cache fills can align blocks.
      let source = request.source;
      if (totalSizeBytes !== undefined) {
        const existingSizeBytes =
          source.sizeBytes ?? source.fingerprint?.sizeBytes;
        const parsedExistingSizeBytes =
          existingSizeBytes === undefined || !/^\d+$/.test(existingSizeBytes)
            ? undefined
            : BigInt(existingSizeBytes);
        if (
          parsedExistingSizeBytes !== undefined &&
          parsedExistingSizeBytes !== totalSizeBytes
        ) {
          throw new Error(
            `Expected source size ${existingSizeBytes} but Content-Range reported ${totalSizeBytes.toString()}`
          );
        }

        const sizeBytes = totalSizeBytes.toString();
        if (source.sizeBytes !== sizeBytes) {
          source = {
            ...source,
            sizeBytes,
          };
        }
      }

      return {
        bytes,
        range: request.range,
        source,
      };
    },
  };
}

/**
 * Wraps a byte reader with raw byte cache lookups, block fills, and request
 * coalescing.
 */
export function createCachedByteResourceClient(
  reader: ByteResourceClient,
  caches: ByteCacheLayers
): ByteResourceClient {
  const pendingByteReads = new Map<string, Promise<ByteRangeReadResult>>();

  return {
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
          const sizeBytes =
            request.source.sizeBytes ?? request.source.fingerprint?.sizeBytes;
          const sourceSize =
            sizeBytes === undefined || !/^\d+$/.test(sizeBytes)
              ? undefined
              : BigInt(sizeBytes);

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

      const fillKey = byteRangeCacheKey(fillRequest);
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

/**
 * Creates a decode client backed by a runtime decoder registry and decoded
 * cache.
 */
export function createDecodeResourceClient({
  cache,
  executor = inlineDecodeExecutor,
  registry = defaultDecoderRegistry,
}: {
  readonly cache: DecodedOutputCache;
  readonly executor?: DecodeExecutor;
  readonly registry?: DecoderRegistry;
}): DecodeResourceClient {
  const pendingDecodes = new Map<string, Promise<DecodeResourceResult>>();

  return {
    async decode(request) {
      const decoder = registry.find(request.payload);
      if (!decoder) {
        const payloadDescription = [
          request.payload.encoding,
          request.payload.schemaEncoding,
          request.payload.schema,
        ]
          .filter(Boolean)
          .join("/");

        throw new Error(`No decoder registered for ${payloadDescription}`);
      }

      // Keep decode execution local to this request so cache/in-flight paths
      // share the same selected decoder and request context.
      const runDecode = async (): Promise<DecodeResourceResult> => ({
        decoderId: decoder.id,
        decoderVersion: decoder.version,
        output: await executor.decode({
          bytes: request.bytes,
          context: request.context,
          decoder,
          payload: request.payload,
        }),
        payload: request.payload,
      });

      const cacheKey = request.cache
        ? {
            decoderId: decoder.id,
            decoderOptionsKey: request.cache.decoderOptionsKey,
            decoderVersion: decoder.version,
            payload: request.payload,
            recordId: request.cache.recordId,
            source: request.cache.source,
            streamId: request.cache.streamId,
            timeNs: request.cache.timeNs,
          }
        : undefined;
      if (!cacheKey) {
        return runDecode();
      }

      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const inFlightKey = decodedOutputCacheKey(cacheKey);
      const pendingDecode = pendingDecodes.get(inFlightKey);
      if (pendingDecode) {
        return pendingDecode;
      }

      const decode = runDecode()
        .then(async (result) => {
          await cache.put(cacheKey, result);
          return result;
        })
        .finally(() => {
          pendingDecodes.delete(inFlightKey);
        });
      pendingDecodes.set(inFlightKey, decode);

      return decode;
    },
  };
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
