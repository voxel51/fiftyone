import { create } from "@bufbuild/protobuf";
import type { McapTypes } from "@mcap/core";
import {
  StreamInventorySchema,
  type StreamInventory,
} from "../../../schemas/v1";
import type { McapIndexedReaderLike } from "../reader";
import { SCENE_SOURCE_METADATA, STREAM_METADATA } from "../../../ir";
import { mcapSceneSources } from "./scene-sources";
import { genericRecordDecoderResolutionForChannel } from "./generic-record-decoder";

const MCAP_METADATA_PREFIX = "mcap.";
const MCAP_CHANNEL_METADATA_PREFIX = `${MCAP_METADATA_PREFIX}channel_metadata.`;

/**
 * Builds source inventory stream entries from MCAP summary channel metadata.
 */
export function readMcapTopics(
  reader: McapIndexedReaderLike,
): readonly StreamInventory[] {
  const streams = [...reader.channelsById.entries()].map(
    ([channelId, channel]) => {
      const schema = schemaForChannel(channel, reader.schemasById);

      return create(StreamInventorySchema, {
        displayName: channel.topic,
        metadata: channelMetadata(channelId, channel, reader, schema),
        payload: payloadForChannel(channel, schema),
        recordCount: recordCountForChannel(channelId, reader),
        streamId: channelId.toString(),
      });
    },
  );
  const sourcesByName = new Map(
    mcapSceneSources(streams).map((source) => [source.id, source]),
  );
  return streams.map((stream) => {
    const sourceName = stream.metadata["mcap.topic"] ?? stream.displayName;
    const source = sourceName ? sourcesByName.get(sourceName) : undefined;
    return {
      ...stream,
      metadata: {
        ...stream.metadata,
        [STREAM_METADATA.DECODE_STATUS]:
          stream.metadata["mcap.generic_decode_status"] ?? "unknown",
        [STREAM_METADATA.ENCODING]:
          stream.metadata["mcap.message_encoding"] ??
          stream.payload?.encoding ??
          "unknown",
        [STREAM_METADATA.SCHEMA_NAME]:
          stream.metadata["mcap.schema_name"] ??
          stream.payload?.schema ??
          "no schema",
        ...(sourceName
          ? { [SCENE_SOURCE_METADATA.SOURCE_NAME]: sourceName }
          : {}),
        ...(source
          ? {
              [SCENE_SOURCE_METADATA.TYPE]: source.type,
              ...source.metadata,
            }
          : {}),
      },
    };
  });
}

function channelMetadata(
  channelId: number,
  channel: McapTypes.TypedMcapRecords["Channel"],
  reader: McapIndexedReaderLike,
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined,
): Record<string, string> {
  const metadata = Object.fromEntries(channel.metadata.entries());

  putDerivedMetadata(metadata, "mcap.channel_id", channelId.toString());
  putDerivedMetadata(metadata, "mcap.topic", channel.topic);
  putDerivedMetadata(
    metadata,
    "mcap.message_encoding",
    channel.messageEncoding,
  );
  putDerivedMetadata(metadata, "mcap.schema_id", channel.schemaId.toString());
  putDerivedMetadata(
    metadata,
    "mcap.generic_decode_status",
    genericDecodeStatusForChannel(reader, channel),
  );

  if (schema) {
    putDerivedMetadata(metadata, "mcap.schema_encoding", schema.encoding);
    putDerivedMetadata(metadata, "mcap.schema_name", schema.name);
  }

  for (const [key, value] of channel.metadata.entries()) {
    putDerivedMetadata(
      metadata,
      `${MCAP_CHANNEL_METADATA_PREFIX}${key}`,
      value,
    );
  }

  return metadata;
}

function genericDecodeStatusForChannel(
  reader: McapIndexedReaderLike,
  channel: Pick<
    McapTypes.TypedMcapRecords["Channel"],
    "messageEncoding" | "schemaId"
  >,
): "decodable" | "schema-unavailable" | "unsupported-encoding" {
  const resolution = genericRecordDecoderResolutionForChannel(reader, channel);
  return resolution.status === "ok" ? "decodable" : resolution.reason;
}

function payloadForChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schema: McapTypes.TypedMcapRecords["Schema"] | undefined,
) {
  return {
    encoding: channel.messageEncoding,
    schema: schema?.name,
    schemaEncoding: schema?.encoding,
  };
}

function schemaForChannel(
  channel: McapTypes.TypedMcapRecords["Channel"],
  schemasById: ReadonlyMap<number, McapTypes.TypedMcapRecords["Schema"]>,
): McapTypes.TypedMcapRecords["Schema"] | undefined {
  return channel.schemaId === 0 ? undefined : schemasById.get(channel.schemaId);
}

function recordCountForChannel(
  channelId: number,
  reader: McapIndexedReaderLike,
): string {
  return (
    reader.statistics?.channelMessageCounts.get(channelId)?.toString() ?? "0"
  );
}

function putDerivedMetadata(
  metadata: Record<string, string>,
  key: string,
  value: string,
) {
  if (!(key in metadata)) {
    metadata[key] = value;
  }
}
