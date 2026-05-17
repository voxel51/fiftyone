import type { McapTypes } from "@mcap/core";
import type { DecodeResourceClient } from "../client/resources";
import {
  compareByTimelineTime,
  createWindowBounds,
  isWithinRange,
  maxBigInt,
  minBigInt,
  selectCandidatesForTopic,
} from "./sync";
import { decodeMcapMessage, mcapMessageRecordId } from "./message-decoder";
import type {
  McapActiveTimeline,
  McapDecodedMessage,
  McapReadSynchronizedMessageBatchRequest,
  McapSynchronizedMessageWindow,
} from "./types";
import type { McapIndexedReaderLike } from "./reader";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

interface McapRawMessageCandidate {
  readonly channel: TypedMcapRecords["Channel"];
  readonly message: TypedMcapRecords["Message"];
  readonly schema?: TypedMcapRecords["Schema"];
  readonly timelineTimeNs: bigint;
  readonly topic: string;
}

/**
 * Reads and decodes synchronized MCAP windows for one batched playback request.
 */
export async function readMcapSynchronizedMessageBatch({
  activeTimeline,
  decodeClient,
  reader,
  request,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly decodeClient: DecodeResourceClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadSynchronizedMessageBatchRequest;
}): Promise<readonly McapSynchronizedMessageWindow[]> {
  if (request.timeNs.length === 0) {
    return [];
  }

  const windowBounds = request.timeNs.map((timeNs) =>
    createWindowBounds({
      timeNs,
      defaultStreamPolicy: request.defaultStreamPolicy,
      streamPolicies: request.streamPolicies,
      topics: request.topics,
    })
  );
  const startTimeNs = minBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map((policy) => policy.startTimeNs)
    )
  );
  const endTimeNs = maxBigInt(
    windowBounds.flatMap((bounds) =>
      Object.values(bounds.streamPolicies).map((policy) => policy.endTimeNs)
    )
  );
  const candidates = await collectRawCandidates({
    endTimeNs,
    reader,
    startTimeNs,
    topics: request.topics,
  });
  const decodeCache = new Map<string, Promise<McapDecodedMessage>>();

  return Promise.all(
    windowBounds.map(async ({ timeNs, streamPolicies }) => {
      const messagesByTopic: Record<string, readonly McapDecodedMessage[]> = {};
      const messages: McapDecodedMessage[] = [];

      for (const topic of request.topics) {
        const selected = selectCandidatesForTopic(
          candidates.get(topic) ?? [],
          timeNs,
          streamPolicies[topic],
          compareRawCandidateTieBreaker
        );
        const decoded = await Promise.all(
          selected.map((candidate) =>
            decodeRawCandidate({
              activeTimeline,
              candidate,
              decodeCache,
              decodeClient,
              source: request.source,
            })
          )
        );
        messagesByTopic[topic] = decoded;
        messages.push(...decoded);
      }

      messages.sort(compareByTimelineTime);

      return {
        activeTimeline,
        endTimeNs: maxBigInt(
          Object.values(streamPolicies).map((policy) => policy.endTimeNs)
        ),
        messages,
        messagesByTopic,
        startTimeNs: minBigInt(
          Object.values(streamPolicies).map((policy) => policy.startTimeNs)
        ),
        streamPolicies,
        timeNs,
      };
    })
  );
}

async function collectRawCandidates({
  endTimeNs,
  reader,
  startTimeNs,
  topics,
}: {
  readonly endTimeNs: bigint;
  readonly reader: McapIndexedReaderLike;
  readonly startTimeNs: bigint;
  readonly topics: readonly string[];
}): Promise<Map<string, McapRawMessageCandidate[]>> {
  const candidates = new Map<string, McapRawMessageCandidate[]>();

  for await (const message of reader.readMessages({
    endTime: endTimeNs,
    startTime: startTimeNs,
    topics,
  })) {
    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      throw new Error(`Missing MCAP channel ${message.channelId}`);
    }

    const timelineTimeNs = message.logTime;
    if (!isWithinRange(timelineTimeNs, startTimeNs, endTimeNs)) {
      continue;
    }

    const topicCandidates = candidates.get(channel.topic) ?? [];
    topicCandidates.push({
      channel,
      message,
      schema: reader.schemasById.get(channel.schemaId),
      timelineTimeNs,
      topic: channel.topic,
    });
    candidates.set(channel.topic, topicCandidates);
  }

  return candidates;
}

async function decodeRawCandidate({
  activeTimeline,
  candidate,
  decodeCache,
  decodeClient,
  source,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly candidate: McapRawMessageCandidate;
  readonly decodeCache: Map<string, Promise<McapDecodedMessage>>;
  readonly decodeClient: DecodeResourceClient;
  readonly source: McapReadSynchronizedMessageBatchRequest["source"];
}): Promise<McapDecodedMessage> {
  const key = mcapMessageRecordId(candidate.message);
  let decoded = decodeCache.get(key);

  if (!decoded) {
    decoded = decodeMcapMessage({
      activeTimeline,
      channel: candidate.channel,
      decodeClient,
      message: candidate.message,
      schema: candidate.schema,
      source,
    });
    decodeCache.set(key, decoded);
  }

  return decoded;
}

function compareRawCandidateTieBreaker(
  left: McapRawMessageCandidate,
  right: McapRawMessageCandidate
) {
  if (left.message.channelId !== right.message.channelId) {
    return left.message.channelId - right.message.channelId;
  }

  return left.message.sequence - right.message.sequence;
}
