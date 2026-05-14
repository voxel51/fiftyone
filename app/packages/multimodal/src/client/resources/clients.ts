import { getFetchFunctionExtended } from "@fiftyone/utilities";
import { defaultDecoderRegistry, type DecoderRegistry } from "../../decoders";
import type { Decoder } from "../../decoders";
import { byteRangeCacheKey, decodedOutputCacheKey } from "./cache";
import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./types";
import type {
  ByteCacheLayers,
  ByteCacheBlockSizeBytes,
  ByteRange,
  ByteRangeReadRequest,
  ByteRangeReadResult,
  ByteResourceClient,
  DecodedOutputCache,
  DecodedOutputCacheKey,
  DecodeExecutor,
  DecodeResourceClient,
  DecodeResourceRequest,
  DecodeResourceResult,
} from "./types";

type FetchFunction = ReturnType<typeof getFetchFunctionExtended>;

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
  fetchFunction?: FetchFunction
): ByteResourceClient {
  return {
    async readBytes(request) {
      validateRange(request.range);

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
        retries: 2,
      });
      const bytes = new Uint8Array(buffer);

      const totalSizeBytes = validateContentRange(
        headers,
        request.range,
        expectedLength
      );
      if (bytes.byteLength !== expectedLength) {
        throw new Error(
          `Expected ${expectedLength} bytes but received ${bytes.byteLength}`
        );
      }

      return {
        bytes,
        range: request.range,
        source: sourceWithResolvedSize(request.source, totalSizeBytes),
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
  const inFlightReads = new Map<string, Promise<ByteRangeReadResult>>();

  return {
    async readBytes(request) {
      const cached = await readCachedBytes(caches, request);
      if (cached) {
        return cached;
      }

      const fillRequest = byteCacheFillRequest(request, caches.blockSizeBytes);
      const fillCached = await readCachedBytes(caches, fillRequest);
      if (fillCached) {
        return sliceByteRangeResult(fillCached, request.range);
      }

      const fillKey = byteRangeCacheKey(fillRequest);
      let fill = inFlightReads.get(fillKey);
      if (!fill) {
        fill = reader
          .readBytes(fillRequest)
          .then(async (result) => {
            await caches.memory.put(result);

            return result;
          })
          .finally(() => {
            inFlightReads.delete(fillKey);
          });
        inFlightReads.set(fillKey, fill);
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
  const inFlightDecodes = new Map<string, Promise<DecodeResourceResult>>();

  return {
    async decode(request) {
      const decoder = registry.find(request.payload);
      if (!decoder) {
        throw new Error(
          `No decoder registered for ${formatPayload(request.payload)}`
        );
      }

      const cacheKey = maybeDecodeCacheKey(request, decoder);
      if (!cacheKey) {
        return runDecode(request, decoder, executor);
      }

      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const inFlightKey = decodedOutputCacheKey(cacheKey);
      const inFlight = inFlightDecodes.get(inFlightKey);
      if (inFlight) {
        return inFlight;
      }

      const decode = runDecode(request, decoder, executor)
        .then(async (result) => {
          await cache.put(cacheKey, result);
          return result;
        })
        .finally(() => {
          inFlightDecodes.delete(inFlightKey);
        });
      inFlightDecodes.set(inFlightKey, decode);

      return decode;
    },
  };
}

async function readCachedBytes(
  caches: ByteCacheLayers,
  request: ByteRangeReadRequest
): Promise<ByteRangeReadResult | undefined> {
  return caches.memory.get(request);
}

async function runDecode(
  request: DecodeResourceRequest,
  decoder: Decoder,
  executor: DecodeExecutor
): Promise<DecodeResourceResult> {
  return {
    decoderId: decoder.id,
    decoderVersion: decoder.version,
    output: await executor.decode({
      bytes: request.bytes,
      context: decoderContextForRequest(request),
      decoder,
      payload: request.payload,
      schemaData: request.schemaData,
    }),
    payload: request.payload,
  };
}

function decoderContextForRequest(request: DecodeResourceRequest): unknown {
  if (!request.schemaData) {
    return request.context;
  }

  if (!request.context || typeof request.context !== "object") {
    return {
      schemaData: request.schemaData,
    };
  }

  return {
    ...request.context,
    schemaData: request.schemaData,
  };
}

function maybeDecodeCacheKey(
  request: DecodeResourceRequest,
  decoder: Decoder
): DecodedOutputCacheKey | undefined {
  if (!request.cache) {
    return undefined;
  }

  return {
    decoderId: decoder.id,
    decoderOptionsKey: request.cache.decoderOptionsKey,
    decoderVersion: decoder.version,
    payload: request.payload,
    recordId: request.cache.recordId,
    source: request.cache.source,
    streamId: request.cache.streamId,
    timeNs: request.cache.timeNs,
  };
}

function byteCacheFillRequest(
  request: ByteRangeReadRequest,
  blockSizeBytes: ByteCacheBlockSizeBytes | undefined
): ByteRangeReadRequest {
  const resolvedBlockSizeBytes = resolveBlockSizeBytes(request, blockSizeBytes);

  if (
    !isPositiveSafeInteger(resolvedBlockSizeBytes) ||
    request.range.length >= BigInt(resolvedBlockSizeBytes)
  ) {
    return request;
  }

  const sourceSize = sourceSizeBytes(request);
  if (sourceSize === undefined) {
    return request;
  }

  const blockSize = BigInt(resolvedBlockSizeBytes);
  const offset = (request.range.offset / blockSize) * blockSize;
  const end = minBigInt(offset + blockSize, sourceSize);
  if (end < request.range.offset + request.range.length) {
    return request;
  }

  return {
    ...request,
    range: {
      length: end - offset,
      offset,
    },
  };
}

function resolveBlockSizeBytes(
  request: ByteRangeReadRequest,
  blockSizeBytes: ByteCacheBlockSizeBytes | undefined
): number | undefined {
  if (typeof blockSizeBytes === "function") {
    return blockSizeBytes(request);
  }

  return blockSizeBytes ?? defaultByteCacheBlockSizeBytes(request);
}

function validateContentRange(
  headers: Headers | undefined,
  range: ByteRange,
  expectedLength: number
): bigint | undefined {
  const contentRange = headers?.get("Content-Range");
  if (!contentRange) {
    throw new Error("Expected Content-Range header for byte-range response");
  }

  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange);
  if (!match) {
    throw new Error(`Invalid Content-Range header '${contentRange}'`);
  }

  const start = BigInt(match[1]);
  const end = BigInt(match[2]);
  if (
    start !== range.offset ||
    end !== range.offset + range.length - 1n ||
    safeNumber(end - start + 1n) !== expectedLength
  ) {
    throw new Error(
      `Expected Content-Range for ${range.offset.toString()}-${
        range.offset + range.length - 1n
      } but received '${contentRange}'`
    );
  }

  const totalSizeBytes = match[3] === "*" ? undefined : BigInt(match[3]);
  if (totalSizeBytes !== undefined && end >= totalSizeBytes) {
    throw new Error(`Invalid Content-Range header '${contentRange}'`);
  }

  return totalSizeBytes;
}

function sourceWithResolvedSize(
  source: ByteRangeReadRequest["source"],
  totalSizeBytes: bigint | undefined
) {
  if (totalSizeBytes === undefined) {
    return source;
  }

  const existingSizeBytes = source.sizeBytes ?? source.fingerprint?.sizeBytes;
  const parsedExistingSizeBytes = parseSizeBytes(existingSizeBytes);
  if (
    parsedExistingSizeBytes !== undefined &&
    parsedExistingSizeBytes !== totalSizeBytes
  ) {
    throw new Error(
      `Expected source size ${existingSizeBytes} but Content-Range reported ${totalSizeBytes.toString()}`
    );
  }

  const sizeBytes = totalSizeBytes.toString();
  if (source.sizeBytes === sizeBytes) {
    return source;
  }

  return {
    ...source,
    sizeBytes,
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

function sourceSizeBytes(request: ByteRangeReadRequest): bigint | undefined {
  const sizeBytes =
    request.source.sizeBytes ?? request.source.fingerprint?.sizeBytes;
  return parseSizeBytes(sizeBytes);
}

function validateRange(range: ByteRange) {
  if (range.offset < 0n) {
    throw new Error("Byte range offset must be non-negative");
  }
  if (range.length <= 0n) {
    throw new Error("Byte range length must be positive");
  }
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Byte length ${value.toString()} exceeds safe number range`
    );
  }

  return Number(value);
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function isPositiveSafeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function parseSizeBytes(value: string | undefined): bigint | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }

  return BigInt(value);
}

function formatPayload(payload: DecodeResourceRequest["payload"]): string {
  return [payload.encoding, payload.schemaEncoding, payload.schema]
    .filter(Boolean)
    .join("/");
}
