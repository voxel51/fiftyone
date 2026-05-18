import { create } from "@bufbuild/protobuf";
import type { McapTypes } from "@mcap/core";
import {
  StreamInventorySchema,
  type StreamInventory,
} from "../../../schemas/v1";
import type { McapIndexedReaderLike } from "../reader";

const MCAP_METADATA_PREFIX = "mcap.";
const MCAP_CHANNEL_METADATA_PREFIX = `${MCAP_METADATA_PREFIX}channel_metadata.`;

/**
 * Builds source inventory stream entries from MCAP summary channel metadata.
 */
export function readMcapTopics(
  reader: McapIndexedReaderLike
): readonly StreamInventory[] {
  return [...reader.channelsById.entries()].map(([channelId, channel]) => {
    const schema = schemaForChannel(channel, reader.schemasById);

    return create(StreamInventorySchema, {
      displayName: channel.topic,
      metadata: channelMetadata(channelId, channel, schema),
      payload: payloadForChannel(channel, schema),
      recordCount: recordCountForChannel(channelId, reader),
      streamId: channelId.toString(),
    });
  });
}

function channelMetadata(
  channelId: number,
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined
): Record<string, string> {
  const metadata = Object.fromEntries(channel.metadata.entries());

  putDerivedMetadata(metadata, "mcap.channel_id", channelId.toString());
  putDerivedMetadata(metadata, "mcap.topic", channel.topic);
  putDerivedMetadata(
    metadata,
    "mcap.message_encoding",
    channel.messageEncoding
  );
  putDerivedMetadata(metadata, "mcap.schema_id", channel.schemaId.toString());

  if (schema) {
    putDerivedMetadata(metadata, "mcap.schema_encoding", schema.encoding);
    putDerivedMetadata(metadata, "mcap.schema_name", schema.name);
  }

  for (const [key, value] of channel.metadata.entries()) {
    putDerivedMetadata(
      metadata,
      `${MCAP_CHANNEL_METADATA_PREFIX}${key}`,
      value
    );
  }

  return metadata;
}

function payloadForChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined
) {
  return {
    encoding: channel.messageEncoding,
    schema: schema?.name,
    schemaEncoding: schema?.encoding,
  };
}

function schemaForChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schemasById: ReadonlyMap<number, McapTypes.TypedMcapRecords["Schema"]>
): McapTypes.TypedMcapRecords["Schema"] | undefined {
  return channel.schemaId === 0 ? undefined : schemasById.get(channel.schemaId);
}

function recordCountForChannel(
  channelId: number,
  reader: McapIndexedReaderLike
): string {
  return (
    reader.statistics?.channelMessageCounts.get(channelId)?.toString() ?? "0"
  );
}

function putDerivedMetadata(
  metadata: Record<string, string>,
  key: string,
  value: string
) {
  if (!(key in metadata)) {
    metadata[key] = value;
  }
}
