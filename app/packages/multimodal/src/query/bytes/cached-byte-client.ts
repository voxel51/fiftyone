import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { safeNumber } from "./bigint-utils";
import { serializeCacheKey } from "../cache-utils";
import { byteSourceAccessKey } from "./cache";
import {
  acquireByteFillSlot,
  byteFillLockName,
  byteFillSlotFloor,
  tryAcquireByteFillSlot,
} from "./fill-lock";
import { parseByteSize } from "./byte-size";
import { monotonicNowMs } from "../../utils/monotonic-time";
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

/**
 * Purely resolves the cache fill a logical request may trigger.
 *
 * Admission and execution both call this planner so byte-bounded readers
 * charge the widened physical range rather than only the returned slice.
 */
export function planByteCacheFillRequest(
  request: ByteRangeReadRequest,
  blockSizeBytes: number | undefined,
): ByteRangeReadRequest {
  if (
    request.cachePolicy?.blockFill === false ||
    blockSizeBytes === undefined ||
    !Number.isSafeInteger(blockSizeBytes) ||
    blockSizeBytes <= 0 ||
    request.range.length >= BigInt(blockSizeBytes)
  ) {
    return request;
  }

  const sourceSize = parseByteSize(request.source.sizeBytes);
  if (sourceSize === undefined) {
    return request;
  }
  const blockSize = BigInt(blockSizeBytes);
  const offset = (request.range.offset / blockSize) * blockSize;
  const blockEnd = offset + blockSize;
  const end = blockEnd < sourceSize ? blockEnd : sourceSize;
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
  const fillSlotFloor = byteFillSlotFloor(caches.fillSlotClass);
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

  const fillExclusive = async (
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

    const isRemote =
      fillRequest.source.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE;
    const acquireSlotBeforeShape =
      isRemote && caches.fillSlotClass === "background";

    // A queued background fill must not hold the shape lock while both
    // background-eligible slots are busy: a priority fill for that same
    // shape would otherwise wait behind it while reserved slot 0 idles.
    // Priority keeps shape-first ordering so duplicate foreground demand
    // still single-flights without consuming slots while waiting.
    const releasePreAcquiredSlot = acquireSlotBeforeShape
      ? await acquireByteFillSlot(
          fillLocks,
          fillRequest.source,
          fillRequest.signal,
          fillSlotFloor,
        )
      : undefined;
    try {
      return await new Promise<ByteFillOutcome>((resolve, reject) => {
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

              // Priority remote fills acquire a slot only after winning
              // their shape. Background remote fills already own one so
              // they cannot block priority admission before network work.
              const releaseSlot =
                isRemote && !releasePreAcquiredSlot
                  ? await acquireByteFillSlot(
                      fillLocks,
                      fillRequest.source,
                      fillRequest.signal,
                      fillSlotFloor,
                    )
                  : undefined;
              let outcome: ByteFillOutcome;
              try {
                outcome = await fillFromNetwork(fillRequest);
              } finally {
                releaseSlot?.();
              }
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
    } finally {
      // This also covers an under-lock persistent hit, abort while queued
      // on the shape, and every network failure path.
      releasePreAcquiredSlot?.();
    }
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

      if (!fillLocks || !persistent) {
        // Single-context path (no cross-context locks means no slots to
        // meter with): plain speculative fetch, as before.
        const startMs = byteReadNowMs();
        const fill = fillFromNetwork(readahead).finally(() => {
          pendingByteReads.delete(fillKey);
        });
        pendingByteReads.set(fillKey, fill);
        const outcome = await fill;
        void persistent?.put(outcome.result).catch(() => undefined);
        logByteRead(caches, {
          cacheResult: outcome.cacheResult,
          fillRequest: readahead,
          request: readahead,
          result: outcome.result,
          startMs,
        });
        return;
      }

      // Speculation runs strictly in the link's spare capacity: no free
      // fill slot (demand owns the link) or the block already filling in
      // another context → skip without waiting on anything. Its nonblocking
      // shape request prevents speculation from tying up a slot, and the
      // retrigger TTL revisits skipped shapes once the link clears.
      // Readahead is background by definition — the reserved priority
      // slot is never its to take, whatever this client's class.
      const releaseSlot = await tryAcquireByteFillSlot(
        fillLocks,
        readahead.source,
        byteFillSlotFloor("background"),
      );
      if (!releaseSlot) {
        return;
      }
      try {
        await new Promise<void>((resolveDone, rejectDone) => {
          fillLocks
            .request(
              byteFillLockName(readahead),
              { ifAvailable: true, mode: "exclusive" },
              async (lock) => {
                if (!lock) {
                  resolveDone();
                  return;
                }
                // Register in the in-flight map only now that this context
                // is definitely the filler: a skipped readahead must never
                // poison a coalesced demand read, while demand arriving
                // during the fetch still shares the in-memory result.
                const startMs = byteReadNowMs();
                let resolveOutcome!: (outcome: ByteFillOutcome) => void;
                let rejectOutcome!: (error: unknown) => void;
                const registered = new Promise<ByteFillOutcome>(
                  (resolveFill, rejectFill) => {
                    resolveOutcome = resolveFill;
                    rejectOutcome = rejectFill;
                  },
                );
                // The rejection is for coalesced demand readers; without
                // any, it must not surface as an unhandled rejection.
                registered.catch(() => undefined);
                pendingByteReads.set(fillKey, registered);
                try {
                  // Re-check the persistent layer under the lock, exactly
                  // like the demand path.
                  const persisted = await persistent.get(readahead);
                  let outcome: ByteFillOutcome;
                  if (persisted) {
                    await caches.memory.put(persisted);
                    outcome = {
                      cacheResult: "persistent-hit",
                      result: persisted,
                    };
                  } else {
                    try {
                      outcome = await fillFromNetwork(readahead);
                    } finally {
                      // The network part is done — free the slot before
                      // the persistent put so it never gates the link.
                      releaseSlot();
                    }
                  }
                  resolveOutcome(outcome);
                  logByteRead(caches, {
                    cacheResult: outcome.cacheResult,
                    fillRequest: readahead,
                    request: readahead,
                    result: outcome.result,
                    startMs,
                  });
                  if (outcome.cacheResult === "fetched") {
                    // Lock held through the put: waiters land as disk hits.
                    await persistent.put(outcome.result).catch(() => undefined);
                  }
                  resolveDone();
                } catch (error) {
                  rejectOutcome(error);
                  rejectDone(error);
                } finally {
                  pendingByteReads.delete(fillKey);
                }
              },
            )
            .catch(rejectDone);
        });
      } finally {
        releaseSlot();
      }
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
    if (request.cachePolicy?.readahead === false) {
      return;
    }
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
    planRead(request) {
      return planByteCacheFillRequest(request, resolveBlockSizeBytes(request));
    },

    async stat(source) {
      return reader.stat?.(source);
    },

    async readBytes(request) {
      const startMs = byteReadNowMs();
      const fillRequest = planByteCacheFillRequest(
        request,
        resolveBlockSizeBytes(request),
      );

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
        return sliceByteRangeResult(
          withByteReadUsage(cachedFill, fillRequest.range, "fill-hit"),
          request.range,
        );
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
          return withByteReadUsage(
            cachedRequest,
            fillRequest.range,
            "request-hit",
          );
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
        return sliceByteRangeResult(
          withByteReadUsage(persistedFill, fillRequest.range, "persistent-hit"),
          request.range,
        );
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

      const outcome = await waitForByteFill(fill, request.signal);
      logByteRead(caches, {
        cacheResult: coalesced ? "coalesced" : outcome.cacheResult,
        fillRequest,
        request,
        result: outcome.result,
        startMs,
      });
      return sliceByteRangeResult(
        withByteReadUsage(
          outcome.result,
          fillRequest.range,
          coalesced ? "coalesced" : outcome.cacheResult,
        ),
        request.range,
      );
    },
  };
}

function waitForByteFill(
  fill: Promise<ByteFillOutcome>,
  signal: AbortSignal | undefined,
): Promise<ByteFillOutcome> {
  if (!signal) {
    return fill;
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortedByteFillWaitError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void fill.then(
      (outcome) => {
        signal.removeEventListener("abort", onAbort);
        resolve(outcome);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}

function abortedByteFillWaitError(): Error {
  const error = new Error("Byte fill wait aborted");
  error.name = "AbortError";
  return error;
}

function withByteReadUsage(
  result: ByteRangeReadResult,
  fillRange: ByteRange,
  cacheResult: NonNullable<ByteRangeReadResult["readUsage"]>["cacheResult"],
): ByteRangeReadResult {
  return {
    ...result,
    readUsage: {
      cacheResult,
      fillRange,
      transferredBytes:
        cacheResult === "fetched"
          ? (result.readUsage?.transferredBytes ?? result.bytes.byteLength)
          : 0,
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
    ...(result.readUsage ? { readUsage: result.readUsage } : {}),
    range,
    source: result.source,
  };
}
