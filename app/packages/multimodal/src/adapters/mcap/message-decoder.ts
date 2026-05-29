import type { McapTypes } from "@mcap/core";
import type { ByteSourceDescriptor } from "../../query/bytes";
import type { DecodeClient } from "../../query/decode";
import type { McapIndexedReaderLike } from "./reader";
import type { McapTimelineStrategy } from "./timeline";
import type { McapDecodedMessage } from "./types";

/**
 * Inputs needed to decode one MCAP message into the adapter's playback shape.
 */
export interface DecodeMcapMessageRequest {
  readonly channel?: McapTypes.TypedMcapRecords["Channel"];
  readonly decodeClient: DecodeClient;
  readonly message: McapTypes.TypedMcapRecords["Message"];
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: McapTypes.TypedMcapRecords["Schema"];
  readonly source: ByteSourceDescriptor;
  readonly timeline: McapTimelineStrategy;
}

/**
 * Decodes one MCAP message and preserves adapter playback metadata.
 */
export async function decodeMcapMessage({
  channel,
  decodeClient,
  message,
  reader,
  schema,
  source,
  timeline,
}: DecodeMcapMessageRequest): Promise<McapDecodedMessage> {
  const resolvedChannel =
    channel ?? reader?.channelsById.get(message.channelId);
  if (!resolvedChannel) {
    throw new Error(`Missing MCAP channel ${message.channelId}`);
  }

  const resolvedSchema =
    schema ?? reader?.schemasById.get(resolvedChannel.schemaId);
  const topic = resolvedChannel.topic;
  const timelineTimeNs = timeline.messageTimeNs(message);
  const decoded = await decodeClient.decode({
    bytes: message.data,
    cache: {
      decoderOptionsKey: timeline.cacheKeySuffix,
      recordId: mcapMessageRecordId(message),
      source,
      streamId: topic,
      timeNs: timelineTimeNs,
    },
    context: {
      schemaData: resolvedSchema?.data,
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: topic,
      timeRangeStartKey: timeline.decodeTimeRangeStartKey,
    },
    payload: {
      encoding: resolvedChannel.messageEncoding,
      schema: resolvedSchema?.name,
      schemaEncoding: resolvedSchema?.encoding,
    },
  });

  return {
    activeTimeline: timeline.id,
    channelId: message.channelId,
    decoded,
    logTimeNs: message.logTime,
    publishTimeNs: message.publishTime,
    sequence: message.sequence,
    timelineTimeNs,
    topic,
  };
}

/**
 * Builds a stable per-message identity for decoded-output cache keys.
 */
export function mcapMessageRecordId(
  message: McapTypes.TypedMcapRecords["Message"]
): string {
  // Channel/time/sequence are the intended identity, but malformed or merged
  // streams can reuse them. Include payload shape so decode caches stay honest.
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
    message.data.byteLength.toString(),
    hashMessageData(message.data),
  ].join(":");
}

function hashMessageData(data: Uint8Array): string {
  // FNV-1a is tiny, deterministic, fast; this only guards local cache keys
  let hash = 0x811c9dc5;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
