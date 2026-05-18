import type { McapTypes } from "@mcap/core";
import type { DecodeResourceClient } from "../../client/resources";
import type { ByteSourceDescriptor } from "../../client/resources";
import type { PayloadDescriptor } from "../../decoders";
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
    payload: payloadFromMcapChannel(resolvedChannel, resolvedSchema),
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
 * Maps MCAP channel/schema metadata to the generic decoder payload descriptor.
 */
export function payloadFromMcapChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined
): PayloadDescriptor {
  return {
    encoding: channel.messageEncoding,
    schema: schema?.name,
    schemaEncoding: schema?.encoding,
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
