import type { McapTypes } from "@mcap/core";
import { DEFAULT_MAX_PREDECESSOR_CHUNK_PROBES } from "./latest-before";
import {
  channelIdsForTopics,
  readChunkIndexedMessageTimes,
} from "./message-index";
import type {
  McapIndexedReaderLike,
  McapReadTopicIndexedTimeBoundsRequest,
  McapTopicIndexedTimeBounds,
} from "./types";
import { positiveIntegerOption } from "./validation";

/**
 * Guard against accidental fan-out: callers resolve bounds for the
 * handful of supported topics, not the whole inventory of a large file.
 */
export const MAX_TOPIC_TIME_BOUNDS_TOPICS = 128;

/**
 * Resolves each topic's first and last indexed message log time using
 * chunk message-index footers only — chunk message data is never
 * decompressed. Topics with no indexed messages map to null.
 *
 * Both bounds use directional chunk walks with best-so-far stop
 * conditions: chunk start/end times are chunk-global across channels,
 * so an overlapping chunk can still hold an earlier/later entry for a
 * specific channel — one chunk read is the common case, not a
 * guarantee.
 */
export async function readTopicIndexedTimeBoundsForReader(
  reader: McapIndexedReaderLike,
  readable: McapTypes.IReadable,
  args: McapReadTopicIndexedTimeBoundsRequest,
): Promise<ReadonlyMap<string, McapTopicIndexedTimeBounds | null>> {
  if (args.topics.length > MAX_TOPIC_TIME_BOUNDS_TOPICS) {
    throw new Error(
      `MCAP topic time bounds support at most ${MAX_TOPIC_TIME_BOUNDS_TOPICS} topics per request`,
    );
  }

  const maxChunkProbes = positiveIntegerOption({
    context: "MCAP topic time-bounds lookup",
    defaultValue: DEFAULT_MAX_PREDECESSOR_CHUNK_PROBES,
    name: "maxChunkProbesPerTopic",
    value: args.maxChunkProbesPerTopic,
  });
  const results = new Map<string, McapTopicIndexedTimeBounds | null>();

  for (const topic of args.topics) {
    results.set(
      topic,
      await topicTimeBounds({ maxChunkProbes, readable, reader, topic }),
    );
  }

  return results;
}

async function topicTimeBounds({
  maxChunkProbes,
  readable,
  reader,
  topic,
}: {
  readonly maxChunkProbes: number;
  readonly readable: McapTypes.IReadable;
  readonly reader: McapIndexedReaderLike;
  readonly topic: string;
}): Promise<McapTopicIndexedTimeBounds | null> {
  const channelIds = channelIdsForTopics(reader.channelsById, [topic]);
  if (channelIds.size === 0) {
    return null;
  }

  const chunkIndexes: readonly McapTypes.TypedMcapRecords["ChunkIndex"][] =
    reader.chunkIndexes;
  const memberChunks = chunkIndexes.filter((chunkIndex) =>
    chunkHasAnyChannel(chunkIndex, channelIds),
  );
  if (memberChunks.length === 0) {
    return null;
  }

  const firstLogTimeNs = await directionalBound({
    channelIds,
    maxChunkProbes,
    memberChunks,
    direction: "first",
    readable,
    reader,
    topic,
  });
  const lastLogTimeNs = await directionalBound({
    channelIds,
    maxChunkProbes,
    memberChunks,
    direction: "last",
    readable,
    reader,
    topic,
  });
  if (firstLogTimeNs === undefined || lastLogTimeNs === undefined) {
    return null;
  }

  return { firstLogTimeNs, lastLogTimeNs };
}

async function directionalBound({
  channelIds,
  direction,
  maxChunkProbes,
  memberChunks,
  readable,
  reader,
  topic,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly direction: "first" | "last";
  readonly maxChunkProbes: number;
  readonly memberChunks: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
  readonly readable: McapTypes.IReadable;
  readonly reader: McapIndexedReaderLike;
  readonly topic: string;
}): Promise<bigint | undefined> {
  const ordered = [...memberChunks].sort((left, right) =>
    direction === "first"
      ? compareBigInt(left.messageStartTime, right.messageStartTime)
      : compareBigInt(right.messageEndTime, left.messageEndTime),
  );

  let best: bigint | undefined;
  let probes = 0;

  for (const chunkIndex of ordered) {
    if (best !== undefined) {
      // No remaining chunk can beat the best-so-far bound.
      const cannotImprove =
        direction === "first"
          ? chunkIndex.messageStartTime > best
          : chunkIndex.messageEndTime < best;
      if (cannotImprove) {
        break;
      }
    }
    if (probes >= maxChunkProbes) {
      console.warn(
        `[mcap] topic time-bounds walk for ${topic} hit the ${maxChunkProbes}-chunk probe cap; using best bound found so far`,
      );
      break;
    }
    probes += 1;

    const entries = await readChunkIndexedMessageTimes({
      channelIds,
      chunkIndex,
      endTimeNs: undefined,
      readable,
      reader,
      startTimeNs: undefined,
    });
    if (entries.length === 0) {
      continue;
    }

    const candidate =
      direction === "first"
        ? entries[0].logTimeNs
        : entries[entries.length - 1].logTimeNs;
    if (
      best === undefined ||
      (direction === "first" ? candidate < best : candidate > best)
    ) {
      best = candidate;
    }
  }

  return best;
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
