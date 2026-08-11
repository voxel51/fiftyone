import { create } from "@bufbuild/protobuf";
import { StreamInventorySchema } from "../../../../schemas/v1/index";
import type {
  McapAttachmentIndex,
  McapChannel,
  McapIndexedReaderLike,
  McapMetadataIndex,
  McapSchema,
} from "../../reader/index";
import {
  SCENE_SOURCE_METADATA,
  STREAM_METADATA,
  type EpisodeRecordingFacts,
  type McapCompressionFacts,
  type McapMessageIndexStatus,
} from "../../../../ir/index";
import { mcapSceneSources } from "../scene-sources";
import { genericRecordDecoderResolutionForChannel } from "../generic-record-decoder";
import type { McapRecordingInventory } from "../../contracts/index";

const MCAP_METADATA_PREFIX = "mcap.";
const MCAP_CHANNEL_METADATA_PREFIX = `${MCAP_METADATA_PREFIX}channel_metadata.`;

/**
 * Builds source inventory stream entries from MCAP summary channel metadata.
 */
export function readMcapTopics(
  reader: McapIndexedReaderLike,
): McapRecordingInventory {
  const chunkFacts = summarizeChunks(reader);
  const exactBrowsingTopics = usableMessageIndexTopics(
    reader,
    chunkFacts.indexedChannelIds,
  );
  const streams = [...reader.channelsById.entries()].map(
    ([channelId, channel]) => {
      const schema = schemaForChannel(channel, reader.schemasById);

      return create(StreamInventorySchema, {
        displayName: channel.topic,
        metadata: channelMetadata(
          channelId,
          channel,
          reader,
          schema,
          exactBrowsingTopics.has(channel.topic),
        ),
        payload: payloadForChannel(channel, schema),
        recordCount: recordCountForChannel(channelId, reader),
        streamId: channelId.toString(),
      });
    },
  );
  const sourcesByName = new Map(
    mcapSceneSources(streams).map((source) => [source.id, source]),
  );
  const normalizedStreams = streams.map((stream) => {
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
  return {
    recordingFacts: recordingFacts(reader, chunkFacts),
    streams: normalizedStreams,
  };
}

function channelMetadata(
  channelId: number,
  channel: McapChannel,
  reader: McapIndexedReaderLike,
  schema: McapSchema | undefined,
  supportsExactBrowsing: boolean,
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
  // Capability metadata is authoritative; source-authored channel metadata
  // must not opt a stream into exact reads without a usable index.
  metadata["mcap.exact_browsing"] = supportsExactBrowsing ? "true" : "false";
  // Needed to resolve `absolute`-mode's epoch anchor before the playback
  // engine mounts. Its internal clock is always 0-based from the episode's
  // first message, so mapping back to real wall-clock time requires this value.
  putDerivedMetadata(
    metadata,
    "mcap.scene_start_time_ns",
    (reader.statistics?.messageStartTime ?? 0n).toString(),
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

function usableMessageIndexTopics(
  reader: McapIndexedReaderLike,
  indexedChannelIds: ReadonlySet<number>,
): ReadonlySet<string> {
  const topics = new Set<string>();
  if (
    !reader.readIndexedMessages ||
    !reader.readIndexedMessageTimes ||
    !reader.readLatestIndexedMessageTimes
  ) {
    return topics;
  }
  const channelIdsByTopic = new Map<string, number[]>();
  for (const channel of reader.channelsById.values()) {
    const channelIds = channelIdsByTopic.get(channel.topic) ?? [];
    channelIds.push(channel.id);
    channelIdsByTopic.set(channel.topic, channelIds);
  }
  for (const [topic, channelIds] of channelIdsByTopic) {
    if (channelIds.every((channelId) => indexedChannelIds.has(channelId))) {
      topics.add(topic);
    }
  }
  return topics;
}

interface McapChunkFacts {
  readonly compression: readonly McapCompressionFacts[];
  readonly compressionRatio?: number;
  readonly indexedChannelIds: ReadonlySet<number>;
  readonly medianChannelsPerChunk?: number;
  readonly medianChunkSizeBytes?: string;
  readonly medianChunkSpanNs?: string;
  readonly messageIndexStatus: McapMessageIndexStatus;
}

function summarizeChunks(reader: McapIndexedReaderLike): McapChunkFacts {
  const compressionByCodec = new Map<
    string,
    { chunkCount: number; compressedBytes: bigint; uncompressedBytes: bigint }
  >();
  const indexedChannelIds = new Set<number>();
  const channelCounts: number[] = [];
  const chunkSizes: bigint[] = [];
  const chunkSpans: bigint[] = [];
  let indexedChunkCount = 0;
  let nonEmptyChunkCount = 0;
  let totalCompressedBytes = 0n;
  let totalUncompressedBytes = 0n;

  for (const chunk of reader.chunkIndexes) {
    const codec = chunk.compression || "none";
    const compression = compressionByCodec.get(codec) ?? {
      chunkCount: 0,
      compressedBytes: 0n,
      uncompressedBytes: 0n,
    };
    compression.chunkCount++;
    compression.compressedBytes += chunk.compressedSize;
    compression.uncompressedBytes += chunk.uncompressedSize;
    compressionByCodec.set(codec, compression);
    totalCompressedBytes += chunk.compressedSize;
    totalUncompressedBytes += chunk.uncompressedSize;
    chunkSizes.push(chunk.compressedSize);
    if (chunk.messageEndTime >= chunk.messageStartTime) {
      chunkSpans.push(
        BigInt(chunk.messageEndTime) - BigInt(chunk.messageStartTime),
      );
    }

    const emptyChunk =
      chunk.messageStartTime === 0n && chunk.messageEndTime === 0n;
    if (!emptyChunk) nonEmptyChunkCount++;
    if (
      chunk.messageIndexLength <= 0n ||
      chunk.messageIndexOffsets.size === 0
    ) {
      continue;
    }
    if (!emptyChunk) indexedChunkCount++;
    channelCounts.push(chunk.messageIndexOffsets.size);
    for (const channelId of chunk.messageIndexOffsets.keys()) {
      indexedChannelIds.add(channelId);
    }
  }

  const messageIndexStatus = messageIndexStatusFor({
    chunkCount: reader.chunkIndexes.length,
    indexedChunkCount,
    nonEmptyChunkCount,
  });
  const compression = [...compressionByCodec.entries()]
    .map(
      ([codec, facts]): McapCompressionFacts => ({
        chunkCount: facts.chunkCount,
        codec,
        compressedBytes: facts.compressedBytes.toString(),
        uncompressedBytes: facts.uncompressedBytes.toString(),
      }),
    )
    .sort((left, right) => left.codec.localeCompare(right.codec));
  const ratio =
    totalCompressedBytes > 0n
      ? Number(totalUncompressedBytes) / Number(totalCompressedBytes)
      : undefined;

  return {
    compression,
    ...(ratio !== undefined && Number.isFinite(ratio)
      ? { compressionRatio: ratio }
      : {}),
    indexedChannelIds,
    ...(channelCounts.length > 0
      ? { medianChannelsPerChunk: medianNumber(channelCounts) }
      : {}),
    ...(chunkSizes.length > 0
      ? { medianChunkSizeBytes: medianBigInt(chunkSizes).toString() }
      : {}),
    ...(chunkSpans.length > 0
      ? { medianChunkSpanNs: medianBigInt(chunkSpans).toString() }
      : {}),
    messageIndexStatus,
  };
}

function recordingFacts(
  reader: McapIndexedReaderLike,
  chunks: McapChunkFacts,
): EpisodeRecordingFacts {
  let embeddedSchemaChannelCount = 0;
  const topics = new Set<string>();
  for (const channel of reader.channelsById.values()) {
    topics.add(channel.topic);
    const schema = reader.schemasById.get(channel.schemaId);
    if (channel.schemaId !== 0 && schema && schema.data.byteLength > 0) {
      embeddedSchemaChannelCount++;
    }
  }
  const channelCount = reader.channelsById.size;
  const attachments = reader.attachmentIndexes?.map(
    (attachment: McapAttachmentIndex) => ({
      dataSizeBytes: attachment.dataSize.toString(),
      mediaType: attachment.mediaType,
      name: attachment.name,
    }),
  );
  const metadataRecordNames = reader.metadataIndexes?.map(
    (metadata: McapMetadataIndex) => metadata.name,
  );

  return {
    channelCount,
    format: "mcap",
    ...(reader.statistics
      ? { messageCount: reader.statistics.messageCount.toString() }
      : {}),
    mcap: {
      ...(reader.statistics || reader.attachmentIndexes
        ? {
            attachmentCount:
              reader.statistics?.attachmentCount ?? attachments?.length ?? 0,
          }
        : {}),
      ...(attachments ? { attachments } : {}),
      chunkCount: reader.statistics?.chunkCount ?? reader.chunkIndexes.length,
      ...(chunks.compression.length > 0
        ? { compression: chunks.compression }
        : {}),
      ...(chunks.compressionRatio !== undefined
        ? { compressionRatio: chunks.compressionRatio }
        : {}),
      ...(reader.header ? { library: reader.header.library } : {}),
      ...(chunks.medianChannelsPerChunk !== undefined
        ? { medianChannelsPerChunk: chunks.medianChannelsPerChunk }
        : {}),
      ...(chunks.medianChunkSizeBytes
        ? { medianChunkSizeBytes: chunks.medianChunkSizeBytes }
        : {}),
      ...(chunks.medianChunkSpanNs
        ? { medianChunkSpanNs: chunks.medianChunkSpanNs }
        : {}),
      messageIndexStatus: chunks.messageIndexStatus,
      ...(reader.statistics || reader.metadataIndexes
        ? {
            metadataRecordCount:
              reader.statistics?.metadataCount ??
              metadataRecordNames?.length ??
              0,
          }
        : {}),
      ...(metadataRecordNames ? { metadataRecordNames } : {}),
      ...(reader.header ? { profile: reader.header.profile } : {}),
    },
    schemaCount: reader.schemasById.size,
    schemaCoverage: {
      embeddedSchemaChannelCount,
      missingSchemaChannelCount: channelCount - embeddedSchemaChannelCount,
    },
    topicCount: topics.size,
  };
}

function messageIndexStatusFor({
  chunkCount,
  indexedChunkCount,
  nonEmptyChunkCount,
}: {
  readonly chunkCount: number;
  readonly indexedChunkCount: number;
  readonly nonEmptyChunkCount: number;
}): McapMessageIndexStatus {
  if (chunkCount === 0 || nonEmptyChunkCount === 0) return "unknown";
  if (indexedChunkCount === 0) return "absent";
  return indexedChunkCount === nonEmptyChunkCount ? "complete" : "partial";
}

function medianNumber(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function medianBigInt(values: readonly bigint[]): bigint {
  const ordered = [...values].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2n;
}

function genericDecodeStatusForChannel(
  reader: McapIndexedReaderLike,
  channel: Pick<McapChannel, "messageEncoding" | "schemaId">,
): "decodable" | "schema-unavailable" | "unsupported-encoding" {
  const resolution = genericRecordDecoderResolutionForChannel(reader, channel);
  return resolution.status === "ok" ? "decodable" : resolution.reason;
}

function payloadForChannel(
  channel: McapChannel,
  schema: McapSchema | undefined,
) {
  return {
    encoding: channel.messageEncoding,
    schema: schema?.name,
    schemaEncoding: schema?.encoding,
  };
}

function schemaForChannel(
  channel: McapChannel,
  schemasById: ReadonlyMap<number, McapSchema>,
): McapSchema | undefined {
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
