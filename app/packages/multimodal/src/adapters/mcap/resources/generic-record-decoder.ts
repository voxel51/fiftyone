import { getProtobufMessageType } from "../decoders/foxglove/protobuf";
import { asRecord } from "../decoders/foxglove/protobuf/records";
import { decodeJsonRecord } from "../decoders/json/decode";
import {
  isRosMessageEncoding,
  rosRecordDecoderForChannel,
} from "../decoders/ros/wire";
import type { McapIndexedReaderLike } from "../reader";
import type { McapDecodeUnavailableReason } from "../types";

/**
 * Channel summary fields needed to resolve a generic record decoder.
 */
export interface McapGenericDecodableChannel {
  readonly messageEncoding: string;
  readonly schemaId: number;
}

/**
 * Result of resolving a generic per-message record decoder for an MCAP channel.
 */
export type McapGenericRecordDecoderResolution =
  | {
      readonly decodeRecord: (bytes: Uint8Array) => Record<string, unknown>;
      readonly status: "ok";
    }
  | {
      readonly reason: McapDecodeUnavailableReason;
      readonly status: "unavailable";
    };

/**
 * Resolves a schema-shaped record decoder for one channel, independent
 * of the visualization decoder registry: protobuf channels decode
 * through the cached descriptor type, JSON channels through
 * `JSON.parse`, and ROS channels through cached message readers. Returns
 * null when the decoder is unavailable; callers needing the reason should
 * use `genericRecordDecoderResolutionForChannel`.
 */
export function genericRecordDecoderForChannel(
  reader: McapIndexedReaderLike,
  channel: McapGenericDecodableChannel,
): ((bytes: Uint8Array) => Record<string, unknown>) | null {
  const resolution = genericRecordDecoderResolutionForChannel(reader, channel);
  return resolution.status === "ok" ? resolution.decodeRecord : null;
}

/**
 * Resolves a generic record decoder and, when unavailable, explains
 * whether the blocker is the message encoding itself or an unusable schema.
 */
export function genericRecordDecoderResolutionForChannel(
  reader: McapIndexedReaderLike,
  channel: McapGenericDecodableChannel,
): McapGenericRecordDecoderResolution {
  if (channel.messageEncoding === "json") {
    return { decodeRecord: decodeJsonRecord, status: "ok" };
  }

  const rosDecoder = rosRecordDecoderForChannel(reader, channel);
  if (rosDecoder) {
    return { decodeRecord: rosDecoder, status: "ok" };
  }
  if (isRosMessageEncoding(channel.messageEncoding)) {
    return { reason: "schema-unavailable", status: "unavailable" };
  }

  const schema = reader.schemasById.get(channel.schemaId);
  if (channel.messageEncoding === "protobuf") {
    if (
      schema?.encoding !== "protobuf" ||
      !schema.name ||
      schema.data.byteLength === 0
    ) {
      return { reason: "schema-unavailable", status: "unavailable" };
    }

    let messageType: ReturnType<typeof getProtobufMessageType>;
    try {
      messageType = getProtobufMessageType(schema.data, schema.name);
    } catch {
      return { reason: "schema-unavailable", status: "unavailable" };
    }

    return {
      decodeRecord: (bytes) => asRecord(messageType.decode(bytes)),
      status: "ok",
    };
  }

  return { reason: "unsupported-encoding", status: "unavailable" };
}

/**
 * Resolves the summary channel behind one topic. Throws when the topic
 * has no channel — requests for unknown topics are caller bugs.
 */
export function mcapChannelForTopic(
  reader: McapIndexedReaderLike,
  topic: string,
) {
  for (const channel of reader.channelsById.values()) {
    if (channel.topic === topic) {
      return channel;
    }
  }

  throw new Error(`MCAP topic '${topic}' has no channel`);
}
