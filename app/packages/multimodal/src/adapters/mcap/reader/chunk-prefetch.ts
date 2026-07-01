import type { McapTypes } from "@mcap/core";
import { channelIdsForTopics } from "./message-index";

/**
 * Remote-transport pipelining for indexed MCAP reads.
 *
 * `@mcap/core` fetches strictly serially: one awaited read per chunk message
 * index, one awaited read per chunk, in consumption order. Local reads make
 * that invisible; remote object-storage reads pay one round trip per touch,
 * so a multi-chunk window degrades into a line of idle round trips.
 *
 * These helpers warm the byte layer for a read that is about to happen. They
 * issue the same byte ranges the reader will request, with bounded
 * concurrency, through the same readable — so the byte cache's block fills
 * and in-flight coalescing dedupe the racing reads instead of duplicating
 * them. Prefetch is advisory: failures are swallowed because the reader's
 * own reads surface real errors on the critical path with retries intact.
 */

/**
 * Caps one prefetch pass so a wide window cannot flood the byte cache and
 * evict blocks that the consuming reader has not used yet.
 */
const DEFAULT_PREFETCH_MAX_CHUNKS = 32;

/**
 * Matches the browser's per-origin HTTP/1.1 connection budget, which is the
 * realistic parallelism ceiling against object storage and media proxies.
 */
const DEFAULT_PREFETCH_CONCURRENCY = 6;

type McapChunkIndex = McapTypes.TypedMcapRecords["ChunkIndex"];
type McapChannel = McapTypes.TypedMcapRecords["Channel"];

/**
 * One byte range a prefetch pass should warm.
 */
export interface McapPrefetchByteRange {
  readonly length: bigint;
  readonly offset: bigint;
}

/**
 * Log-time window prefetch request for an upcoming indexed read.
 */
export interface McapPrefetchWindowRequest {
  /**
   * Inclusive maximum log timestamp, in nanoseconds.
   */
  readonly endTimeNs?: bigint;

  /**
   * Warm chunk record data for the window. Defaults to true.
   */
  readonly includeChunkData?: boolean;

  /**
   * Warm chunk message-index regions for the window. Defaults to true.
   */
  readonly includeMessageIndexes?: boolean;

  /**
   * Cap on chunks warmed by this pass; earliest chunks win.
   */
  readonly maxChunks?: number;

  /**
   * Cap on concurrently in-flight prefetch reads.
   */
  readonly maxConcurrentReads?: number;

  /**
   * Inclusive minimum log timestamp, in nanoseconds.
   */
  readonly startTimeNs?: bigint;

  /**
   * Topics whose chunks should be warmed; omitting warms all topics.
   */
  readonly topics?: readonly string[];
}

/**
 * Exact chunk-set prefetch request for messages already resolved from
 * message indexes (candidates carry their chunk start offsets).
 */
export interface McapPrefetchChunkDataRequest {
  /**
   * Absolute file offsets of the chunks about to be read.
   */
  readonly chunkStartOffsets: Iterable<bigint>;

  /**
   * Cap on chunks warmed by this pass; earliest chunks win.
   */
  readonly maxChunks?: number;

  /**
   * Cap on concurrently in-flight prefetch reads.
   */
  readonly maxConcurrentReads?: number;
}

/**
 * Resolves the byte ranges an indexed read over a log-time window will
 * touch: per-chunk message-index regions first (they gate candidate
 * enumeration), then chunk record data in consumption order.
 */
export function collectWindowPrefetchRanges({
  channelsById,
  chunkIndexes,
  request,
}: {
  readonly channelsById: ReadonlyMap<number, McapChannel>;
  readonly chunkIndexes: readonly McapChunkIndex[];
  readonly request: McapPrefetchWindowRequest;
}): readonly McapPrefetchByteRange[] {
  const includeChunkData = request.includeChunkData ?? true;
  const includeMessageIndexes = request.includeMessageIndexes ?? true;
  if (!includeChunkData && !includeMessageIndexes) {
    return [];
  }

  const channelIds =
    request.topics === undefined
      ? undefined
      : channelIdsForTopics(channelsById, request.topics);
  if (channelIds !== undefined && channelIds.size === 0) {
    return [];
  }

  const chunks = chunkIndexes
    .filter(
      (chunkIndex) =>
        chunkOverlapsWindow(chunkIndex, request) &&
        chunkHasAnyChannel(chunkIndex, channelIds),
    )
    .sort((left, right) =>
      compareBigInt(left.messageStartTime, right.messageStartTime),
    )
    .slice(0, request.maxChunks ?? DEFAULT_PREFETCH_MAX_CHUNKS);

  const ranges: McapPrefetchByteRange[] = [];
  if (includeMessageIndexes) {
    for (const chunkIndex of chunks) {
      const messageIndexRange = chunkMessageIndexRange(chunkIndex);
      if (messageIndexRange) {
        ranges.push(messageIndexRange);
      }
    }
  }
  if (includeChunkData) {
    for (const chunkIndex of chunks) {
      ranges.push({
        length: chunkIndex.chunkLength,
        offset: chunkIndex.chunkStartOffset,
      });
    }
  }

  return ranges;
}

/**
 * Resolves chunk record data ranges for an exact chunk offset set.
 */
export function collectChunkDataPrefetchRanges({
  chunkIndexes,
  request,
}: {
  readonly chunkIndexes: readonly McapChunkIndex[];
  readonly request: McapPrefetchChunkDataRequest;
}): readonly McapPrefetchByteRange[] {
  const wanted = new Set<bigint>(request.chunkStartOffsets);
  if (wanted.size === 0) {
    return [];
  }

  return chunkIndexes
    .filter((chunkIndex) => wanted.has(chunkIndex.chunkStartOffset))
    .sort((left, right) =>
      compareBigInt(left.messageStartTime, right.messageStartTime),
    )
    .slice(0, request.maxChunks ?? DEFAULT_PREFETCH_MAX_CHUNKS)
    .map((chunkIndex) => ({
      length: chunkIndex.chunkLength,
      offset: chunkIndex.chunkStartOffset,
    }));
}

/**
 * Warms byte ranges with bounded concurrency, preserving issue order.
 * Advisory by design: per-range failures are swallowed so the consuming
 * read remains the single owner of error semantics.
 */
export async function prefetchMcapByteRanges(
  readable: McapTypes.IReadable,
  ranges: readonly McapPrefetchByteRange[],
  maxConcurrentReads = DEFAULT_PREFETCH_CONCURRENCY,
): Promise<void> {
  if (ranges.length === 0) {
    return;
  }

  const concurrency = Math.max(1, Math.min(maxConcurrentReads, ranges.length));
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const range = ranges[index];
      if (!range) {
        return;
      }
      if (range.length <= 0n) {
        continue;
      }

      try {
        await readable.read(range.offset, range.length);
      } catch {
        // Advisory read; the consuming reader surfaces real failures.
      }
    }
  });

  await Promise.all(workers);
}

/**
 * Full message-index region for one chunk: every channel's index records
 * live contiguously in `messageIndexLength` bytes after the earliest offset.
 */
function chunkMessageIndexRange(
  chunkIndex: McapChunkIndex,
): McapPrefetchByteRange | undefined {
  if (
    chunkIndex.messageIndexOffsets.size === 0 ||
    chunkIndex.messageIndexLength === 0n
  ) {
    return undefined;
  }

  let start: bigint | undefined;
  for (const offset of chunkIndex.messageIndexOffsets.values()) {
    if (start === undefined || offset < start) {
      start = offset;
    }
  }
  if (start === undefined) {
    return undefined;
  }

  return {
    length: chunkIndex.messageIndexLength,
    offset: start,
  };
}

function chunkOverlapsWindow(
  chunkIndex: McapChunkIndex,
  request: McapPrefetchWindowRequest,
): boolean {
  if (
    request.startTimeNs !== undefined &&
    chunkIndex.messageEndTime < request.startTimeNs
  ) {
    return false;
  }
  if (
    request.endTimeNs !== undefined &&
    chunkIndex.messageStartTime > request.endTimeNs
  ) {
    return false;
  }

  return true;
}

function chunkHasAnyChannel(
  chunkIndex: McapChunkIndex,
  channelIds: ReadonlySet<number> | undefined,
): boolean {
  if (channelIds === undefined) {
    return true;
  }
  // Writers index only channels present in a chunk, so the offset key set is
  // a chunk-level channel presence test that avoids reading any bytes.
  if (chunkIndex.messageIndexOffsets.size === 0) {
    return true;
  }

  for (const channelId of chunkIndex.messageIndexOffsets.keys()) {
    if (channelIds.has(channelId)) {
      return true;
    }
  }

  return false;
}

function compareBigInt(left: bigint, right: bigint) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
