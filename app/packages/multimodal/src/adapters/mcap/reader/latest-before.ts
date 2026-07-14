import type { McapTypes } from "@mcap/core";
import {
  channelIdsForTopics,
  compareIndexedMessageTimes,
  readChunkIndexedMessageTimes,
} from "./message-index";
import type {
  McapIndexedMessageTime,
  McapIndexedReaderLike,
  McapReadLatestIndexedMessageTimesRequest,
} from "./types";
import { positiveIntegerOption } from "./validation";

/**
 * Per-topic ceiling on message-index reads during one predecessor walk.
 * Ordered files resolve in a single read; the cap only matters for
 * pathological chunk layouts (heavy overlap), where a slightly stale
 * best-so-far answer beats unbounded I/O.
 */
export const DEFAULT_MAX_PREDECESSOR_CHUNK_PROBES = 64;

/**
 * Resolves, per topic, the newest indexed message entries at or before
 * `timeNs` with unbounded lookback — the predecessor query behind
 * latest-at-or-before playback selection. Only chunk message-index
 * footers are read; chunk message data is never decompressed.
 *
 * Member chunks are walked newest-first by `messageEndTime`, keeping a
 * best-N set; the walk stops once no remaining chunk can contain a
 * newer entry. Chunk/file ordering is never trusted (MCAP allows
 * overlapping and unordered chunks).
 */
export async function readLatestIndexedMessageTimesForReader(
  reader: McapIndexedReaderLike,
  readable: McapTypes.IReadable,
  args: McapReadLatestIndexedMessageTimesRequest,
): Promise<ReadonlyMap<string, readonly McapIndexedMessageTime[]>> {
  const limit = args.limitPerTopic ?? 1;
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
    throw new Error(
      "MCAP latest-message lookup requires a positive integer per-topic limit",
    );
  }

  const maxChunkProbes = positiveIntegerOption({
    context: "MCAP latest-message lookup",
    defaultValue: DEFAULT_MAX_PREDECESSOR_CHUNK_PROBES,
    name: "maxChunkProbesPerTopic",
    value: args.maxChunkProbesPerTopic,
  });
  const results = new Map<string, readonly McapIndexedMessageTime[]>();

  // Channels are exclusive to one topic, so per-topic walks never read
  // the same (chunk, channel) index slice twice.
  for (const topic of args.topics) {
    results.set(
      topic,
      await latestEntriesForTopic({
        limit,
        maxChunkProbes,
        readable,
        reader,
        timeNs: args.timeNs,
        topic,
      }),
    );
  }

  return results;
}

async function latestEntriesForTopic({
  limit,
  maxChunkProbes,
  readable,
  reader,
  timeNs,
  topic,
}: {
  readonly limit: number;
  readonly maxChunkProbes: number;
  readonly readable: McapTypes.IReadable;
  readonly reader: McapIndexedReaderLike;
  readonly timeNs: bigint;
  readonly topic: string;
}): Promise<readonly McapIndexedMessageTime[]> {
  const channelIds = channelIdsForTopics(reader.channelsById, [topic]);
  if (channelIds.size === 0) {
    return [];
  }

  // Membership comes from the in-memory summary — chunks that can't
  // contain a qualifying entry cost zero I/O.
  const chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    reader.chunkIndexes;
  const memberChunks = chunkIndexes
    .filter(
      (chunkIndex) =>
        chunkIndex.messageStartTime <= timeNs &&
        chunkHasAnyChannel(chunkIndex, channelIds),
    )
    .sort((left, right) =>
      compareBigInt(right.messageEndTime, left.messageEndTime),
    );

  // Newest-first best-N across the walk.
  const best: McapIndexedMessageTime[] = [];
  let probes = 0;

  for (const chunkIndex of memberChunks) {
    // Strict inequality: a chunk ending exactly at the N-th best time
    // can still hold equal-time entries that win on tie-break order.
    if (
      best.length >= limit &&
      chunkIndex.messageEndTime < best[best.length - 1].logTimeNs
    ) {
      break;
    }
    if (probes >= maxChunkProbes) {
      console.warn(
        `[mcap] predecessor walk for ${topic} hit the ${maxChunkProbes}-chunk probe cap; using best match found so far`,
      );
      break;
    }
    probes += 1;

    const entries = await readChunkIndexedMessageTimes({
      channelIds,
      chunkIndex,
      endTimeNs: timeNs,
      readable,
      reader,
      startTimeNs: undefined,
    });
    if (entries.length === 0) {
      continue;
    }

    best.push(...entries);
    best.sort((left, right) => compareIndexedMessageTimes(right, left));
    best.length = Math.min(best.length, limit);
  }

  return [...best].sort(compareIndexedMessageTimes);
}

function chunkHasAnyChannel(
  chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"],
  channelIds: ReadonlySet<number>,
): boolean {
  for (const channelId of channelIds) {
    if (chunkIndex.messageIndexOffsets.has(channelId)) {
      return true;
    }
  }

  return false;
}

function compareBigInt(left: bigint, right: bigint) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }

  return 0;
}
