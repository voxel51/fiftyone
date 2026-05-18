import type { McapTypes } from "@mcap/core";
import type {
  ByteSourceDescriptor,
  DecodeResourceClient,
} from "../../client/resources";
import type { McapIndexedReaderLike } from "./reader";
import type { McapTimelineStrategy } from "./timeline";
import type { McapDecodedMessage } from "./types";

/**
 * Inputs needed to decode one MCAP message into the adapter's playback shape.
 */
export interface DecodeMcapMessageRequest {
  readonly channel?: McapTypes.TypedMcapRecords["Channel"];
  readonly decodeClient: DecodeResourceClient;
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
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
  ].join(":");
}
