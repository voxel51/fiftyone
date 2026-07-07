import { getProtobufMessageType } from "../decoders/foxglove/protobuf";
import { asRecord } from "../decoders/foxglove/protobuf/records";
import { decodeJsonRecord } from "../decoders/json/decode";
import type { McapIndexedReaderLike } from "../reader";

/**
 * Channel summary fields needed to resolve a generic record decoder.
 */
export interface McapGenericDecodableChannel {
  readonly messageEncoding: string;
  readonly schemaId: number;
}

/**
 * Resolves a schema-shaped record decoder for one channel, independent
 * of the visualization decoder registry: protobuf channels decode
 * through the cached descriptor type, JSON channels through
 * `JSON.parse`. Returns null for encodings with no generic decode path
 * yet (e.g. cbor, ros1) so callers choose their own degrade.
 */
export function genericRecordDecoderForChannel(
  reader: McapIndexedReaderLike,
  channel: McapGenericDecodableChannel,
): ((bytes: Uint8Array) => Record<string, unknown>) | null {
  if (channel.messageEncoding === "json") {
    return decodeJsonRecord;
  }

  const schema = reader.schemasById.get(channel.schemaId);
  if (
    channel.messageEncoding === "protobuf" &&
    schema?.encoding === "protobuf" &&
    schema.name &&
    schema.data.byteLength > 0
  ) {
    const messageType = getProtobufMessageType(schema.data, schema.name);
    return (bytes) => asRecord(messageType.decode(bytes));
  }

  return null;
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
