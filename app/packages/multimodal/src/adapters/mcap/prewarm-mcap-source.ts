import { createMultimodalQueryClient } from "../../query";
import {
  createMemoryByteRangeCache,
  type ByteClient,
  type ByteSourceDescriptor,
} from "../../query/bytes";
import { ByteClientReadable } from "./reader/byte-readable";
import {
  collectWindowPrefetchRanges,
  createDefaultMcapReader,
  prefetchMcapByteRanges,
  type McapPrefetchByteRange,
  type McapReaderFactory,
} from "./reader";

/**
 * Advisory byte-level prewarm for a source the user is likely to open next
 * (adjacent samples in modal navigation). Parses the file summary and warms
 * the startup window's message indexes and chunk data — pure byte fetches,
 * no decode — through a cached byte client whose persistent Cache API layer
 * is shared with the playback workers. When the user navigates, the
 * workers' cold reads become persistent-cache hits instead of network
 * round trips.
 *
 * Runs outside the worker fleet on purpose: worker lanes are owned by the
 * active source (`activateSource`), and routing another source's reads
 * through them would thrash the per-lane reader parking.
 */

/** Startup window worth warming; mirrors the playback startup cushion. */
const PREWARM_WINDOW_NS = 2_000_000_000n;

/** Chunk cap before the byte budget applies; earliest chunks win. */
const PREWARM_MAX_CHUNKS = 16;

/** Hard byte ceiling per prewarm pass across all warmed ranges. */
const PREWARM_MAX_BYTES = 48n * 1024n * 1024n;

/**
 * Gentler than the reader's own prefetch parallelism: prewarm shares the
 * link with the active sample's playback and must never crowd it.
 */
const PREWARM_CONCURRENCY = 2;

/**
 * Small main-thread L1: the persistent L2 is the delivery vehicle, so
 * retaining prewarmed bytes in this client's memory would duplicate what
 * the workers will hold anyway.
 */
const PREWARM_MEMORY_CACHE_BYTES = 8 * 1024 * 1024;

let sharedPrewarmByteClient: ByteClient | null = null;

function prewarmByteClient(): ByteClient {
  sharedPrewarmByteClient ??= createMultimodalQueryClient({
    caches: {
      bytes: {
        memory: createMemoryByteRangeCache({
          maxSizeBytes: PREWARM_MEMORY_CACHE_BYTES,
        }),
      },
    },
  }).bytes;

  return sharedPrewarmByteClient;
}

export interface PrewarmMcapSourceOptions {
  /** Test injection; defaults to a shared small-memory cached client. */
  readonly byteClient?: ByteClient;
  /** Test injection; defaults to the real indexed reader. */
  readonly readerFactory?: McapReaderFactory;
  /** Aborts in-flight prewarm reads (e.g. the modal closed). */
  readonly signal?: AbortSignal;
  /** Startup window to warm, from the file's first message. */
  readonly windowNs?: bigint;
  /** Byte ceiling for the warmed ranges. */
  readonly maxBytes?: bigint;
}

/**
 * Warms one source's summary and startup-window bytes. Advisory: throws
 * only for programming errors; transport failures surface when (and if)
 * the real read happens.
 */
export async function prewarmMcapSource(
  source: ByteSourceDescriptor,
  options: PrewarmMcapSourceOptions = {},
): Promise<void> {
  const readSignal = { current: options.signal ?? null };
  const byteClient = options.byteClient ?? prewarmByteClient();
  const readable = new ByteClientReadable(source, byteClient, { readSignal });
  const readerFactory = options.readerFactory ?? createDefaultMcapReader;

  // Summary parse pulls the footer, schema, channel, and chunk-index
  // records through the byte client — those bytes land in the shared
  // persistent cache as a side effect.
  const reader = await readerFactory(source, readable);
  if (options.signal?.aborted) {
    return;
  }

  const startTimeNs = reader.statistics?.messageStartTime;
  const windowNs = options.windowNs ?? PREWARM_WINDOW_NS;
  const ranges = collectWindowPrefetchRanges({
    channelsById: reader.channelsById,
    chunkIndexes: reader.chunkIndexes,
    request: {
      maxChunks: PREWARM_MAX_CHUNKS,
      ...(startTimeNs !== undefined
        ? { endTimeNs: startTimeNs + windowNs, startTimeNs }
        : {}),
    },
  });

  await prefetchMcapByteRanges(
    readable,
    trimRangesToByteBudget(ranges, options.maxBytes ?? PREWARM_MAX_BYTES),
    PREWARM_CONCURRENCY,
  );
}

function trimRangesToByteBudget(
  ranges: readonly McapPrefetchByteRange[],
  maxBytes: bigint,
): readonly McapPrefetchByteRange[] {
  const trimmed: McapPrefetchByteRange[] = [];
  let total = 0n;

  for (const range of ranges) {
    if (trimmed.length > 0 && total + range.length > maxBytes) {
      break;
    }
    trimmed.push(range);
    total += range.length;
  }

  return trimmed;
}
