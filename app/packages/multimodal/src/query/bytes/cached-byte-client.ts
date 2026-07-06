import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { safeNumber } from "./bigint-utils";
import { serializeCacheKey } from "../cache-utils";
import { byteSourceAccessKey } from "./cache";
import { byteFillLockName } from "./fill-lock";
import { parseByteSize } from "./byte-size";
import { monotonicNowMs } from "../../time";
import type {
  ByteClient,
  ByteCacheLayers,
  ByteRange,
  ByteRangeCache,
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

interface ByteFillOutcome {
  readonly cacheResult: "fetched" | "persistent-hit";
  readonly result: ByteRangeReadResult;
}

/**
 * Minimum delay before re-evaluating readahead for the same fill shape.
 */
const READAHEAD_RETRIGGER_MS = 2_000;

/**
 * Recent-readahead entries tracked per client before oldest-first pruning.
 */
const READAHEAD_TRACKED_FILLS = 64;

/**
 * Wraps a byte reader with raw byte cache lookups, block fills, and request
 * coalescing.
 */
export function createCachedByteClient(
  reader: ByteClient,
  caches: ByteCacheLayers,
): ByteClient {
  const pendingByteReads = new Map<string, Promise<ByteFillOutcome>>();
  const fillLocks = caches.locks || undefined;
  const readaheadIssuedAtMs = new Map<string, number>();

  const resolveBlockSizeBytes = (
    request: ByteRangeReadRequest,
  ): number | undefined =>
    typeof caches.blockSizeBytes === "function"
      ? caches.blockSizeBytes(request)
      : (caches.blockSizeBytes ?? defaultByteCacheBlockSizeBytes(request));

  const fillFromNetwork = async (
    fillRequest: ByteRangeReadRequest,
  ): Promise<ByteFillOutcome> => {
    const result = await reader.readBytes(fillRequest);
    await caches.memory.put(result);
    return { cacheResult: "fetched", result };
  };

  const fillExclusive = (
    fillRequest: ByteRangeReadRequest,
    persistent: ByteRangeCache | undefined,
  ): Promise<ByteFillOutcome> => {
    if (!fillLocks || !persistent) {
      // The persistent layer is the cross-context handoff medium; without
      // it a lock would only serialize fetches that still each hit the
      // network, so fall through to the plain fetch path.
      return fillFromNetwork(fillRequest).then((outcome) => {
        // Persisting must not delay the read; the entry lands for the
        // next context (or reload) to hit.
        void persistent?.put(outcome.result).catch(() => undefined);
        return outcome;
      });
    }

    return new Promise<ByteFillOutcome>((resolve, reject) => {
      fillLocks
        .request(
          byteFillLockName(fillRequest),
          {
            mode: "exclusive",
            ...(fillRequest.signal ? { signal: fillRequest.signal } : {}),
          },
          async () => {
            // Re-check the persistent layer under the lock: when another
            // context raced this fill, its bytes are already on disk and
            // this read must not touch the network again.
            const persisted = await persistent.get(fillRequest);
            if (persisted) {
              await caches.memory.put(persisted);
              resolve({ cacheResult: "persistent-hit", result: persisted });
              return;
            }

            const outcome = await fillFromNetwork(fillRequest);
            resolve(outcome);
            // Waiters are released only after the persistent entry lands —
            // holding the lock through the put is what turns their fetches
            // into disk hits. The caller was already resolved above, so
            // this costs waiters nothing extra and the caller nothing.
            await persistent.put(outcome.result).catch(() => undefined);
          },
        )
        .catch(reject);
    });
  };

  const queueReadaheadFill = (readahead: ByteRangeReadRequest) => {
    void (async () => {
      const cached = await caches.memory.get(readahead);
      if (cached) {
        return;
      }
      const fillKey = byteRangeAccessKey(readahead);
      if (pendingByteReads.has(fillKey)) {
        return;
      }
      const persistent = readahead.source.localFile
        ? undefined
        : caches.persistent || undefined;
      // A persistent hit still promotes to memory: the sequential reader
      // is about to want these bytes, so move the disk wait off its path.
      const persistedFill = await persistent?.get(readahead);
      if (persistedFill) {
        await caches.memory.put(persistedFill);
        return;
      }
      if (pendingByteReads.has(fillKey)) {
        return;
      }
      const startMs = byteReadNowMs();
      const fill = fillExclusive(readahead, persistent).finally(() => {
        pendingByteReads.delete(fillKey);
      });
      pendingByteReads.set(fillKey, fill);
      const outcome = await fill;
      logByteRead(caches, {
        cacheResult: outcome.cacheResult,
        fillRequest: readahead,
        request: readahead,
        result: outcome.result,
        startMs,
      });
    })().catch(() => undefined);
  };

  /**
   * Sequential consumers (playback) march through block fills one request
   * at a time, so on remote transports per-request latency leaves the link
   * idle between fills. Keep the successor block in flight: every
   * block-widened fill speculatively queues the next block through the
   * same lock + persistent path. The chain self-sustains while access
   * stays sequential and dies out on random access; readahead fills are
   * exactly block-shaped, so they never widen and never cascade.
   */
  const maybeQueueRemoteReadahead = (
    request: ByteRangeReadRequest,
    fillRequest: ByteRangeReadRequest,
  ) => {
    if (request.source.readProfile !== BYTE_SOURCE_READ_PROFILE.REMOTE) {
      return;
    }
    // Only block-widened fills imply forward locality; exact-shape reads
    // (message indexes, one-off probes) do not.
    if (fillRequest === request) {
      return;
    }
    const sourceSize = parseByteSize(fillRequest.source.sizeBytes);
    if (sourceSize === undefined) {
      return;
    }
    const nextOffset = fillRequest.range.offset + fillRequest.range.length;
    if (nextOffset >= sourceSize) {
      return;
    }
    // Resolve the block size at the readahead's own offset: zoned block
    // policies change shape across the file, and a chain crossing a zone
    // boundary must adopt the new zone's fill grid, not drag its own.
    const blockSizeBytes = resolveBlockSizeBytes({
      ...request,
      range: { length: 1n, offset: nextOffset },
    });
    if (
      blockSizeBytes === undefined ||
      !Number.isSafeInteger(blockSizeBytes) ||
      blockSizeBytes <= 0
    ) {
      return;
    }
    const blockEnd = nextOffset + BigInt(blockSizeBytes);
    const readahead: ByteRangeReadRequest = {
      // No abort signal on purpose: the readahead belongs to the byte
      // layer, not to the triggering request. Its cost is bounded by one
      // block, and its bytes stay useful in the shared caches.
      range: {
        length: (blockEnd < sourceSize ? blockEnd : sourceSize) - nextOffset,
        offset: nextOffset,
      },
      source: request.source,
    };

    const key = byteRangeAccessKey(readahead);
    const now = byteReadNowMs();
    const issuedAt = readaheadIssuedAtMs.get(key);
    if (issuedAt !== undefined && now - issuedAt < READAHEAD_RETRIGGER_MS) {
      return;
    }
    readaheadIssuedAtMs.delete(key);
    readaheadIssuedAtMs.set(key, now);
    if (readaheadIssuedAtMs.size > READAHEAD_TRACKED_FILLS) {
      const oldest = readaheadIssuedAtMs.keys().next().value;
      if (oldest !== undefined) {
        readaheadIssuedAtMs.delete(oldest);
      }
    }

    queueReadaheadFill(readahead);
  };

  return {
    async stat(source) {
      return reader.stat?.(source);
    },

    async readBytes(request) {
      const startMs = byteReadNowMs();
      // Widen small reads to cacheable blocks when the source size is known.
      let fillRequest = request;
      if (request.cachePolicy?.blockFill !== false) {
        const blockSizeBytes = resolveBlockSizeBytes(request);

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

      maybeQueueRemoteReadahead(request, fillRequest);

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
        request.source.localFile || request.cachePolicy?.blockFill === false
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
      const coalesced = fill !== undefined;
      if (!fill) {
        fill = fillExclusive(fillRequest, persistent).finally(() => {
          pendingByteReads.delete(fillKey);
        });
        pendingByteReads.set(fillKey, fill);
      }

      const outcome = await fill;
      logByteRead(caches, {
        cacheResult: coalesced ? "coalesced" : outcome.cacheResult,
        fillRequest,
        request,
        result: outcome.result,
        startMs,
      });
      return sliceByteRangeResult(outcome.result, request.range);
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
  const debugEnabled = caches.debug?.enabled === true;
  if (!debugEnabled && !caches.onRead) return;

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

  caches.onRead?.(entry);
  if (debugEnabled) {
    (caches.debug?.log ?? defaultByteReadDebugLogger)(entry);
  }
}

function defaultByteReadDebugLogger(entry: ByteReadDebugLog): void {
  console.log("[multimodal] byte read", entry);
}

function byteReadNowMs(): number {
  return monotonicNowMs();
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
