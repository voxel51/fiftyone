import {
  BYTE_SOURCE_READ_PROFILE,
  DEFAULT_LOCAL_BYTE_CACHE_BLOCK_SIZE_BYTES,
  DEFAULT_REMOTE_BYTE_CACHE_BLOCK_SIZE_BYTES,
} from "./constants";
import { safeNumber } from "./bigint-utils";
import { serializeCacheKey } from "../cache-utils";
import { byteSourceCacheKey } from "./cache";
import {
  acquireByteFillSlot,
  byteFillLockName,
  byteFillSlotFloor,
  tryAcquireByteFillSlot,
} from "./fill-lock";
import { parseByteSize } from "./byte-size";
import { createByteSourceSizeRegistry } from "./source-size-registry";
import { monotonicNowMs } from "../../utils/monotonic-time";
import { createAbortError, isAbortError } from "../../utils/cancellation";
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
 * Times a reader re-issues a fill that another reader's abort killed.
 *
 * One physical fetch serves everyone who joined it, and it follows the signal
 * of whichever request started it. So a reader that merely joined can be
 * cancelled by a reader that left - a grid tile scrolled out of view killing
 * the fetch a tile still on screen is waiting on. Bounded because a genuine
 * cancellation storm must not turn into an unbounded retry storm.
 */
const COALESCED_ABORT_ATTEMPTS = 3;

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
  // A source whose manifest carried no size is unwidenable and unprefetchable
  // until some read reports its length; this is what keeps that report.
  const sizes = createByteSourceSizeRegistry();
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
    // A ranged response reports the object's total length, so every later
    // read of these contents can widen and chain readahead.
    sizes.remember(result.source);
    await caches.memory.put(result);
    return { cacheResult: "fetched", result };
  };

  const completeFillUnderLock = async ({
    fillNetwork,
    fillRequest,
    onOutcome,
    persistent,
  }: {
    readonly fillNetwork: () => Promise<ByteFillOutcome>;
    readonly fillRequest: ByteRangeReadRequest;
    readonly onOutcome: (outcome: ByteFillOutcome) => void;
    readonly persistent: ByteRangeCache;
  }): Promise<void> => {
    // The persistent recheck and completion ordering are one protocol for
    // demand and speculative fills. Admission remains local to each caller.
    const persisted = await persistent.get(fillRequest);
    const outcome = persisted
      ? { cacheResult: "persistent-hit" as const, result: persisted }
      : await fillNetwork();
    if (persisted) {
      await caches.memory.put(persisted);
    }

    // Publish before the durable write so the initiating caller is not gated
    // by storage, while the shape lock remains held until waiters can hit it.
    onOutcome(outcome);
    if (outcome.cacheResult === "fetched") {
      await persistent.put(outcome.result).catch(() => undefined);
    }
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
              await completeFillUnderLock({
                fillNetwork: async () => {
                  // Priority remote fills acquire a slot only after winning
                  // their shape. Background fills already own one.
                  const releaseSlot =
                    isRemote && !releasePreAcquiredSlot
                      ? await acquireByteFillSlot(
                          fillLocks,
                          fillRequest.source,
                          fillRequest.signal,
                          fillSlotFloor,
                        )
                      : undefined;
                  try {
                    return await fillFromNetwork(fillRequest);
                  } finally {
                    releaseSlot?.();
                  }
                },
                fillRequest,
                onOutcome: resolve,
                persistent,
              });
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
                  await completeFillUnderLock({
                    fillNetwork: async () => {
                      // The network part is done before freeing the slot;
                      // persistent storage never gates the link.
                      try {
                        return await fillFromNetwork(readahead);
                      } finally {
                        releaseSlot();
                      }
                    },
                    fillRequest: readahead,
                    onOutcome: (outcome) => {
                      resolveOutcome(outcome);
                      logByteRead(caches, {
                        cacheResult: outcome.cacheResult,
                        fillRequest: readahead,
                        request: readahead,
                        result: outcome.result,
                        startMs,
                      });
                    },
                    persistent,
                  });
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
    planRead(readRequest) {
      const request = sizes.complete(readRequest);
      return planByteCacheFillRequest(request, resolveBlockSizeBytes(request));
    },

    async stat(source, signal) {
      return reader.stat?.(source, signal);
    },

    async readBytes(readRequest) {
      const startMs = byteReadNowMs();
      // Planned against the size a previous read resolved, where the manifest
      // carried none: without a size neither widening nor readahead can run,
      // and a remote source read bare cannot keep a decoder fed.
      const request = sizes.complete(readRequest);
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

      // Reads whose range nothing will ask for again stay out of the durable
      // layer, or they fill it with entries no later read can match. That is
      // a property of the range, not of whether the read was widened, so the
      // caller says so: a poster frame reads the same span every time its
      // tile is drawn and belongs here; a one-byte size probe does not.
      const persistent =
        request.source.localFile || request.cachePolicy?.persist === false
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
      for (let attempt = 1; ; attempt++) {
        let fill = pendingByteReads.get(fillKey);
        const coalesced = fill !== undefined;
        if (!fill) {
          fill = fillExclusive(fillRequest, persistent).finally(() => {
            pendingByteReads.delete(fillKey);
          });
          pendingByteReads.set(fillKey, fill);
        }

        let outcome: ByteFillOutcome;
        try {
          outcome = await waitForByteFill(fill, request.signal);
        } catch (error: unknown) {
          // This reader still wants its bytes: the abort belonged to whoever
          // started the fetch, not to it. Failing here would surface someone
          // else's cancellation as this read's error.
          if (
            !isAbortError(error) ||
            request.signal?.aborted ||
            attempt >= COALESCED_ABORT_ATTEMPTS
          ) {
            throw error;
          }

          continue;
        }

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
      }
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
      reject(createAbortError("Byte fill wait aborted"));
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
  // Keyed by which bytes these are, not by who asked for them. Every episode
  // of a source selects from the same few files, so a page of tiles asks for
  // one object's bytes many times over; keyed per consumer they each fetch,
  // and the caches only merge them after the first lands - which on a cold
  // page is never in time. This is the same identity the memory cache, the
  // durable cache and the fill locks already agree on.
  return serializeCacheKey([
    byteSourceCacheKey(request.source),
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
