import type { McapTypes } from "@mcap/core";
import { compareBigInt } from "../../../ir";
import { DEFAULT_MAX_PREDECESSOR_CHUNK_PROBES } from "./latest-before";
import {
  channelIdsForTopics,
  readChunkIndexedTimeBounds,
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
const MAX_TOPIC_TIME_BOUNDS_TOPICS = 128;

type ChannelBounds = ReadonlyMap<number, McapTopicIndexedTimeBounds | null>;
interface IndexProbe {
  readonly channelIds: ReadonlySet<number>;
  readonly chunkIndex: McapTypes.TypedMcapRecords["ChunkIndex"];
}

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
  const results = new Map<string, McapTopicIndexedTimeBounds | null>(
    args.topics.map((topic) => [topic, null]),
  );

  let walks = args.topics.map((topic) => {
    const iterator = topicTimeBounds({ maxChunkProbes, reader, topic });
    return { topic, iterator, step: iterator.next() };
  });
  // Only extrema survive each read, scoped to this lookup. First/last walks
  // can revisit a (chunk, channel) without fetching or parsing it twice.
  const cache = new Map<
    bigint,
    Map<number, McapTopicIndexedTimeBounds | null>
  >();
  while (walks.length > 0) {
    const batches = new Map<
      bigint,
      {
        chunkIndex: IndexProbe["chunkIndex"];
        channelIds: Set<number>;
        walks: typeof walks;
      }
    >();
    for (const walk of walks) {
      if (walk.step.done) {
        results.set(walk.topic, walk.step.value);
        continue;
      }
      const { chunkIndex, channelIds } = walk.step.value;
      let batch = batches.get(chunkIndex.chunkStartOffset);
      if (!batch) {
        batch = { chunkIndex, channelIds: new Set(), walks: [] };
        batches.set(chunkIndex.chunkStartOffset, batch);
      }
      for (const id of channelIds) batch.channelIds.add(id);
      batch.walks.push(walk);
    }
    walks = [];
    for (const [offset, batch] of batches) {
      const bounds =
        cache.get(offset) ??
        new Map<number, McapTopicIndexedTimeBounds | null>();
      cache.set(offset, bounds);
      const missing = new Set(
        [...batch.channelIds].filter((id) => !bounds.has(id)),
      );
      if (missing.size > 0) {
        const loaded = await readChunkIndexedTimeBounds({
          channelIds: missing,
          chunkIndex: batch.chunkIndex,
          readable,
          reader,
        });
        for (const [id, bound] of loaded) bounds.set(id, bound);
      }
      for (const walk of batch.walks) {
        walk.step = walk.iterator.next(bounds);
        walks.push(walk);
      }
    }
  }

  return results;
}

function* topicTimeBounds({
  maxChunkProbes,
  reader,
  topic,
}: {
  readonly maxChunkProbes: number;
  readonly reader: McapIndexedReaderLike;
  readonly topic: string;
}): Generator<IndexProbe, McapTopicIndexedTimeBounds | null, ChannelBounds> {
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

  const firstLogTimeNs = yield* directionalBound({
    channelIds,
    maxChunkProbes,
    memberChunks,
    direction: "first",
    topic,
  });
  const lastLogTimeNs = yield* directionalBound({
    channelIds,
    maxChunkProbes,
    memberChunks,
    direction: "last",
    topic,
  });
  if (firstLogTimeNs === undefined || lastLogTimeNs === undefined) {
    return null;
  }

  return { firstLogTimeNs, lastLogTimeNs };
}

function* directionalBound({
  channelIds,
  direction,
  maxChunkProbes,
  memberChunks,
  topic,
}: {
  readonly channelIds: ReadonlySet<number>;
  readonly direction: "first" | "last";
  readonly maxChunkProbes: number;
  readonly memberChunks: readonly McapTypes.TypedMcapRecords["ChunkIndex"][];
  readonly topic: string;
}): Generator<IndexProbe, bigint | undefined, ChannelBounds> {
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

    // Suspend at the next necessary chunk so other topics at this frontier
    // can share the existing bounded index-read coalescer. No speculative
    // channels or media chunks are added to the walk.
    const bounds = yield { channelIds, chunkIndex };
    for (const channelId of channelIds) {
      const bound = bounds.get(channelId);
      if (!bound) continue;
      const candidate =
        direction === "first" ? bound.firstLogTimeNs : bound.lastLogTimeNs;
      if (
        best === undefined ||
        (direction === "first" ? candidate < best : candidate > best)
      ) {
        best = candidate;
      }
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
