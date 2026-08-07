import type { DecoderRegistry } from "../../../../decoders";
import type { McapIndexedReaderLike } from "../../reader";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapPointCloudChannelResult,
  McapReadPointCloudChannelRequest,
} from "../../contracts";
import { throwIfAborted } from "../../../../utils/cancellation";
import { EpisodeReadUnsupportedError } from "../../../../ports";

/** Encoded source bytes admitted for one point-cloud projection message. */
export const POINT_CLOUD_PROJECTION_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

/** Candidate chunks admitted by one point-cloud projection. */
export const POINT_CLOUD_PROJECTION_MAX_CHUNKS = 64;

/** Physical candidate-chunk bytes admitted by one point-cloud projection. */
export const POINT_CLOUD_PROJECTION_MAX_SOURCE_BYTES = 64 * 1024 * 1024;

/** Uncompressed candidate-chunk bytes admitted by one point-cloud projection. */
export const POINT_CLOUD_PROJECTION_MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

/** Refuses oversized point messages before decoder/channel work begins. */
export function assertPointCloudProjectionInputBound(byteLength: number): void {
  if (byteLength <= POINT_CLOUD_PROJECTION_MAX_MESSAGE_BYTES) return;
  throw new EpisodeReadUnsupportedError(
    "point-cloud-channel-projection",
    `Point-cloud projection payload exceeds the ${POINT_CLOUD_PROJECTION_MAX_MESSAGE_BYTES}-byte per-message input bound`,
  );
}

export function assertPointCloudProjectionSourceWorkBound(
  chunkCount: number,
  sourceBytes: bigint,
  uncompressedBytes: bigint,
): void {
  if (
    chunkCount <= POINT_CLOUD_PROJECTION_MAX_CHUNKS &&
    sourceBytes <= BigInt(POINT_CLOUD_PROJECTION_MAX_SOURCE_BYTES) &&
    uncompressedBytes <= BigInt(POINT_CLOUD_PROJECTION_MAX_UNCOMPRESSED_BYTES)
  ) {
    return;
  }
  throw new EpisodeReadUnsupportedError(
    "point-cloud-channel-source-work",
    `Point-cloud projection exceeded its per-read indexed-source bound (${POINT_CLOUD_PROJECTION_MAX_CHUNKS} chunks, ${POINT_CLOUD_PROJECTION_MAX_SOURCE_BYTES} source bytes, or ${POINT_CLOUD_PROJECTION_MAX_UNCOMPRESSED_BYTES} uncompressed bytes)`,
  );
}

/** Reads one exact source message and projects only its requested color data. */
export async function readMcapPointCloudChannel({
  decoderRegistry,
  reader,
  readSignal,
  request,
  timeline,
}: {
  readonly decoderRegistry: DecoderRegistry;
  readonly reader: McapIndexedReaderLike;
  readonly readSignal?: { readonly current: AbortSignal | null };
  readonly request: McapReadPointCloudChannelRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapPointCloudChannelResult> {
  throwIfAborted(readSignal?.current);
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.timeNs,
    startTimeNs: request.timeNs,
  });
  let chunkCount = 0;
  let sourceBytes = 0n;
  let uncompressedBytes = 0n;
  for (const chunk of reader.chunkIndexes) {
    if (
      (startTime !== undefined && chunk.messageEndTime < startTime) ||
      (endTime !== undefined && chunk.messageStartTime > endTime)
    ) {
      continue;
    }
    chunkCount += 1;
    sourceBytes += chunk.chunkLength;
    uncompressedBytes += chunk.uncompressedSize;
    assertPointCloudProjectionSourceWorkBound(
      chunkCount,
      sourceBytes,
      uncompressedBytes,
    );
  }

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [request.topic],
  })) {
    throwIfAborted(readSignal?.current);
    if (timeline.messageTimeNs(message) !== request.timeNs) continue;
    const channel = reader.channelsById.get(message.channelId);
    if (!channel || channel.topic !== request.topic) continue;
    assertPointCloudProjectionInputBound(message.data.byteLength);
    const schema = reader.schemasById.get(channel.schemaId);
    const payload = {
      encoding: channel.messageEncoding,
      schema: schema?.name,
      schemaEncoding: schema?.encoding,
    };
    const decoder = decoderRegistry.find(payload);
    if (!decoder?.projectPointCloudChannel) {
      throw new Error(
        `Point-cloud channel projection is unavailable for ${request.topic}`,
      );
    }

    const result = decoder.projectPointCloudChannel(
      message.data,
      {
        pointCloudColorBy: request.activeColorBy,
        schemaData: schema?.data,
        signal: readSignal?.current ?? undefined,
        sourceTimestamps: {
          logTime: message.logTime,
          publishTime: message.publishTime,
        },
        streamId: channel.topic,
        timeRangeStartKey: timeline.decodeTimeRangeStartKey,
      },
      {
        activeColorBy: request.activeColorBy,
        capacity: request.capacity,
        sampledPointCount: request.sampledPointCount,
        samplePlanKey: request.samplePlanKey,
        sourceIndices: request.sourceIndices,
      },
    );
    throwIfAborted(readSignal?.current);
    return result;
  }

  throw new Error(
    `Missing ${request.topic} point cloud at ${request.timeNs.toString()}`,
  );
}
