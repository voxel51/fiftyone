import type { McapTypes } from "@mcap/core";
import type { DecodeResourceClient } from "../client/resources";
import type { PayloadDescriptor } from "../decoders";
import type {
  McapActiveTimeline,
  McapDecodedMessage,
  McapSourceDescriptor,
} from "./types";
import type { McapIndexedReaderLike } from "./reader";

type TypedMcapRecords = McapTypes.TypedMcapRecords;

/**
 * Inputs needed to decode one MCAP message into the adapter's playback shape.
 */
export interface DecodeMcapMessageRequest {
  readonly activeTimeline: McapActiveTimeline;
  readonly channel?: TypedMcapRecords["Channel"];
  readonly decodeClient: DecodeResourceClient;
  readonly message: TypedMcapRecords["Message"];
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: TypedMcapRecords["Schema"];
  readonly source: McapSourceDescriptor;
}

/**
 * Decodes one MCAP message and preserves adapter playback metadata.
 */
export async function decodeMcapMessage({
  activeTimeline,
  channel,
  decodeClient,
  message,
  reader,
  schema,
  source,
}: DecodeMcapMessageRequest): Promise<McapDecodedMessage> {
  const resolvedChannel =
    channel ?? reader?.channelsById.get(message.channelId);
  if (!resolvedChannel) {
    throw new Error(`Missing MCAP channel ${message.channelId}`);
  }

  const resolvedSchema =
    schema ?? reader?.schemasById.get(resolvedChannel.schemaId);
  const topic = resolvedChannel.topic;
  const decoded = await decodeClient.decode({
    bytes: message.data,
    cache: {
      decoderOptionsKey: `activeTimeline=${activeTimeline}`,
      recordId: mcapMessageRecordId(message),
      source,
      streamId: topic,
      timeNs: message.logTime,
    },
    context: {
      schemaData: resolvedSchema?.data,
      sourceTimestamps: {
        logTime: message.logTime,
        publishTime: message.publishTime,
      },
      streamId: topic,
      timeRangeStartKey: "logTime",
    },
    payload: payloadFromMcapChannel(resolvedChannel, resolvedSchema),
  });

  return {
    activeTimeline,
    channelId: message.channelId,
    decoded,
    logTimeNs: message.logTime,
    publishTimeNs: message.publishTime,
    sequence: message.sequence,
    timelineTimeNs: message.logTime,
    topic,
  };
}

/**
 * Maps MCAP channel/schema metadata to the generic decoder payload descriptor.
 */
export function payloadFromMcapChannel(
  channel: TypedMcapRecords["Channel"],
  schema: TypedMcapRecords["Schema"] | undefined
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
  message: TypedMcapRecords["Message"]
): string {
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
  ].join(":");
}
