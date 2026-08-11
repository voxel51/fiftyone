import type {
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
  DecodedOutput,
} from "../../../../ir";
import type { ReadWorkUsage } from "../../../../ports";
import type { DecodeClient } from "../../../../query/decoding";
import type { McapIndexedReaderLike, McapReadContinuation } from "../../reader";
import { consumeMcapBoundedGrant } from "../../reader/consume-bounded-grant";
import type {
  McapReadTransformTopologyRequest,
  McapTransformTopologyResult,
} from "../../contracts";
import type { McapTimelineStrategy } from "../timeline";
import { decodeMcapMessage } from "../message-decoder";
import { genericRecordDecoderResolutionForChannel } from "../generic-record-decoder";
import { rosHeader, rosHeaderFrameId } from "../../message-decoders/ros/common";
import {
  discoverFrameTransformChannels,
  normalizeFrameTransformMessage,
} from "./frame-transform-candidates";
import { compareFrameIds } from "../../../../utils/frame-ids";

const EMPTY_USAGE: ReadWorkUsage = {
  chunksOpened: 0,
  decompressedBytes: 0,
  decompressionCacheHits: 0,
  elapsedMs: 0,
  logicalSourceBytes: 0,
  logicalUncompressedBytes: 0,
  messagesDecoded: 0,
  transferredBytes: 0,
};

interface MutableObservation {
  childFrameId: string;
  firstObservedTimeNs: bigint;
  kind: EpisodeTransformTopologyEdgeObservation["kind"];
  lastObservedTimeNs: bigint;
  occurrenceCount: number;
  parentFrameId: string;
  sourceName: string;
  sourceStreamId: string;
}

const MAX_FRAME_USE_TOPICS_PER_GRANT = 4;

/**
 * Reads transform-qualified topics through the same bounded chunk executor as
 * other aggregate views, then reuses the placement decoder to normalize them.
 */
export async function readMcapTransformTopology({
  decodeClient,
  reader,
  request,
  signal,
  timeline,
}: {
  readonly decodeClient: DecodeClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadTransformTopologyRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapTransformTopologyResult> {
  if (!reader.readBoundedMessages) {
    throw new Error("MCAP bounded transform topology reads are unavailable");
  }
  const channels = discoverFrameTransformChannels(reader);
  if (channels.length === 0) {
    return {
      coverageByTopic: new Map(),
      edges: [],
      frameUses: [],
      stopReason: "source-exhausted",
      usage: EMPTY_USAGE,
    };
  }
  const channelsById = new Map(
    channels.map((entry) => [entry.channel.id, entry]),
  );
  // Renderable streams can outnumber transform channels by an order of
  // magnitude. Sample only a few deterministic headers so they cannot consume
  // most of the grant before the transform graph itself is observed.
  const transformTopics = channels.map((entry) => entry.channel.topic);
  const transformTopicSet = new Set(transformTopics);
  const frameUseTopics = [...request.frameUseTopics]
    .filter((topic) => !transformTopicSet.has(topic))
    .sort(compareFrameIds)
    .slice(0, MAX_FRAME_USE_TOPICS_PER_GRANT);
  const topics = [...new Set([...transformTopics, ...frameUseTopics])].sort(
    compareFrameIds,
  );
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });
  const result = await reader.readBoundedMessages({
    absoluteBudget: request.absoluteBudget,
    absoluteMaxChunks: request.absoluteMaxChunks,
    budget: request.budget,
    continuation: request.continuation as McapReadContinuation | undefined,
    endTimeNs: endTime,
    maxChunks: request.maxChunks,
    // A source unit that exceeds the explicitly granted work is recorded as
    // unavailable and advanced past. Repeating the continuation cannot spin.
    skipOversizedSourceUnit: true,
    signal,
    startTimeNs: startTime,
    topics,
  });
  const byIdentity = new Map<string, MutableObservation>();
  const frameUses = new Map<string, EpisodeTransformTopologyFrameUse>();
  const sampledFrameUseTopics = new Set<string>();
  const frameUseTopicSet = new Set(frameUseTopics);
  await consumeMcapBoundedGrant({
    items: result.messages,
    onItem: async (message) => {
      const messageChannel = reader.channelsById.get(message.channelId);
      const messageTopic = messageChannel?.topic;
      if (
        messageTopic &&
        frameUseTopicSet.has(messageTopic) &&
        !sampledFrameUseTopics.has(messageTopic)
      ) {
        sampledFrameUseTopics.add(messageTopic);
        try {
          const frameId =
            coordinateFrameIdFromRecord(
              decodeGenericRecord(reader, messageChannel, message.data),
            ) ??
            coordinateFrameIdFromOutput(
              (
                await decodeMcapMessage({
                  channel: messageChannel,
                  decodeClient,
                  message,
                  reader,
                  signal,
                  source: request.source,
                  timeline,
                })
              ).decoded.output,
            );
          if (frameId) {
            frameUses.set(`${frameId}\0${messageTopic}`, {
              frameId,
              sourceName: messageTopic,
              // The session maps this topic to its stable stream identity.
              streamId: messageTopic,
            });
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          // A frame-use sample is optional evidence. A failed decoder does not
          // widen or fail the transform topology grant.
        }
      }
      const channel = channelsById.get(message.channelId);
      if (!channel) return;
      const observedTimeNs = timeline.messageTimeNs(message);
      try {
        for (const sample of normalizeFrameTransformMessage({
          entry: channel,
          message,
        })) {
          const kind = sample.timeNs === undefined ? "static" : "temporal";
          const identity = [
            sample.parentFrameId,
            sample.childFrameId,
            kind,
            channel.channel.topic,
          ].join("\0");
          const current = byIdentity.get(identity);
          if (current) {
            current.occurrenceCount += 1;
            if (observedTimeNs < current.firstObservedTimeNs) {
              current.firstObservedTimeNs = observedTimeNs;
            }
            if (observedTimeNs > current.lastObservedTimeNs) {
              current.lastObservedTimeNs = observedTimeNs;
            }
          } else {
            byIdentity.set(identity, {
              childFrameId: sample.childFrameId,
              firstObservedTimeNs: observedTimeNs,
              kind,
              lastObservedTimeNs: observedTimeNs,
              occurrenceCount: 1,
              parentFrameId: sample.parentFrameId,
              sourceName: channel.channel.topic,
              // The session maps this format-native topic to its stable stream id.
              sourceStreamId: channel.channel.topic,
            });
          }
        }
      } catch {
        // A malformed transform message is local evidence loss, not permission
        // to fail or widen the bounded grant.
      }
    },
    signal,
    usage: () => result.usage,
  });
  const edges = [...byIdentity.values()].sort((left, right) =>
    compareFrameIds(
      [left.parentFrameId, left.childFrameId, left.kind, left.sourceName].join(
        "\0",
      ),
      [
        right.parentFrameId,
        right.childFrameId,
        right.kind,
        right.sourceName,
      ].join("\0"),
    ),
  );
  return {
    ...(result.continuation ? { continuation: result.continuation } : {}),
    coverageByTopic: result.coverageByTopic,
    edges,
    frameUses: [...frameUses.values()].sort((left, right) =>
      compareFrameIds(
        `${left.frameId}\0${left.sourceName}`,
        `${right.frameId}\0${right.sourceName}`,
      ),
    ),
    stopReason: result.stopReason,
    ...(result.skippedByTopic
      ? { unavailableByTopic: result.skippedByTopic }
      : {}),
    usage: result.usage,
  };
}

function decodeGenericRecord(
  reader: McapIndexedReaderLike,
  channel: Parameters<typeof genericRecordDecoderResolutionForChannel>[1],
  bytes: Uint8Array,
): Record<string, unknown> | null {
  try {
    const resolution = genericRecordDecoderResolutionForChannel(
      reader,
      channel,
    );
    if (resolution.status !== "ok") return null;
    return resolution.decodeRecord(bytes);
  } catch {
    return null;
  }
}

function coordinateFrameIdFromRecord(
  record: Record<string, unknown> | null,
): string | null {
  if (!record) return null;
  const direct = record["frame_id"] ?? record["frameId"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return rosHeaderFrameId(rosHeader(record))?.trim() || null;
}

function coordinateFrameIdFromOutput(output: DecodedOutput): string | null {
  const visualization = output.visualization;
  if (!visualization || !("coordinateFrameId" in visualization)) return null;
  const frameId = visualization.coordinateFrameId;
  return typeof frameId === "string" && frameId.trim() ? frameId.trim() : null;
}
