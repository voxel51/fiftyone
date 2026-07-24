import type { DecoderRegistry } from "../../../../decoders";
import type { McapIndexedReaderLike } from "../../reader";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapPointCloudChannelResult,
  McapReadPointCloudChannelRequest,
} from "../../contracts";
import { EpisodeReadCancelledError } from "../../../../ports";

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
  throwIfAborted(readSignal);
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.timeNs,
    startTimeNs: request.timeNs,
  });

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [request.topic],
  })) {
    throwIfAborted(readSignal);
    if (timeline.messageTimeNs(message) !== request.timeNs) continue;
    const channel = reader.channelsById.get(message.channelId);
    if (!channel || channel.topic !== request.topic) continue;
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
    throwIfAborted(readSignal);
    return result;
  }

  throw new Error(
    `Missing ${request.topic} point cloud at ${request.timeNs.toString()}`,
  );
}

function throwIfAborted(
  readSignal: { readonly current: AbortSignal | null } | undefined,
): void {
  if (readSignal?.current?.aborted) {
    throw new EpisodeReadCancelledError();
  }
}
