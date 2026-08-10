import type { McapTypes } from "@mcap/core";
import type { ByteSourceDescriptor } from "../../../query/bytes/index";
import type { DecodeClient } from "../../../query/decoding/index";
import { isEpisodeReadCancelledError } from "../../../ports/index";
import { McapTopicDecodeError } from "../normalization/errors";
import type { McapIndexedReaderLike } from "../reader/index";
import type { McapTimelineStrategy } from "./timeline";
import type { McapDecodedMessage } from "../contracts/index";
import { fnv1aBytesHex } from "../fnv1a";

/**
 * Inputs needed to decode one MCAP message into the adapter's playback shape.
 */
export interface DecodeMcapMessageRequest {
  readonly channel?: McapTypes.TypedMcapRecords["Channel"];
  readonly decodeClient: DecodeClient;
  readonly message: McapTypes.TypedMcapRecords["Message"];
  /**
   * Exact indexed identity of the physical MCAP record, when available.
   * Supplying it avoids hashing the full payload solely to mint a cache key.
   */
  readonly physicalRecordId?: string;
  readonly pointCloudColorBy?: string;
  readonly reader?: McapIndexedReaderLike;
  readonly schema?: McapTypes.TypedMcapRecords["Schema"];
  readonly signal?: AbortSignal;
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
  physicalRecordId,
  pointCloudColorBy,
  reader,
  schema,
  signal,
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
  const payload = {
    encoding: resolvedChannel.messageEncoding,
    schema: resolvedSchema?.name,
    schemaEncoding: resolvedSchema?.encoding,
  };
  let decoded;
  try {
    decoded = await decodeClient.decode({
      bytes: message.data,
      // Raw-message cache identity costs a full-payload record-id hash. An
      // indexed caller supplies the physical record identity instead, while a
      // client with a declared-noop cache never needs either form.
      cache:
        decodeClient.cachesDecodedOutput === false
          ? undefined
          : {
              decoderOptionsKey: [
                timeline.cacheKeySuffix,
                pointCloudColorBy
                  ? `pointCloudColorBy=${pointCloudColorBy}`
                  : null,
              ]
                .filter(Boolean)
                .join(";"),
              recordId:
                physicalRecordId ?? mcapMessageRecordId(message),
              source,
              streamId: topic,
              timeNs: timelineTimeNs,
            },
      context: {
        ...(pointCloudColorBy ? { pointCloudColorBy } : {}),
        schemaData: resolvedSchema?.data,
        ...(signal ? { signal } : {}),
        sourceTimestamps: {
          logTime: message.logTime,
          publishTime: message.publishTime,
        },
        streamId: topic,
        timeRangeStartKey: timeline.decodeTimeRangeStartKey,
      },
      payload,
    });
  } catch (error) {
    if (isEpisodeReadCancelledError(error)) throw error;
    throw new McapTopicDecodeError({
      cause: error,
      messageTimeNs: timelineTimeNs,
      payloadIdentity: JSON.stringify([
        payload.encoding,
        payload.schemaEncoding ?? null,
        payload.schema ?? null,
      ]),
      topic,
    });
  }

  return {
    activeTimeline: timeline.id,
    channelId: message.channelId,
    decoded,
    encodedPayloadBytes: message.data.byteLength,
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
  message: McapTypes.TypedMcapRecords["Message"],
): string {
  // Channel/time/sequence are the intended identity, but malformed or merged
  // streams can reuse them. Include payload shape so decode caches stay honest.
  return [
    message.channelId.toString(),
    message.logTime.toString(),
    message.publishTime.toString(),
    message.sequence.toString(),
    message.data.byteLength.toString(),
    fnv1aBytesHex(message.data),
  ].join(":");
}
