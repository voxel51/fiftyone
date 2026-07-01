import type { DecodeClient } from "../../../query/decode";
import { isWithinRange } from "../sync";
import { decodeMcapMessage } from "../message-decoder";
import type { McapIndexedReaderLike } from "../reader";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
} from "../types";

/**
 * Streams decoded MCAP messages for one read request.
 */
export async function* readMcapDecodedMessages({
  decodeClient,
  reader,
  request,
  timeline,
}: {
  readonly decodeClient: DecodeClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadDecodedMessagesRequest;
  readonly timeline: McapTimelineStrategy;
}): AsyncGenerator<McapDecodedMessage, void, void> {
  // Validate before the read/decode loop so bad limits do not decode one item
  // just to discard it afterward.
  if (
    request.limit !== undefined &&
    (!Number.isFinite(request.limit) ||
      !Number.isInteger(request.limit) ||
      request.limit <= 0)
  ) {
    return;
  }

  let count = 0;
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: request.topics,
  })) {
    const decodedMessage = await decodeMcapMessage({
      decodeClient,
      message,
      reader,
      source: request.source,
      timeline,
    });

    if (
      !isWithinRange(
        decodedMessage.timelineTimeNs,
        request.startTimeNs,
        request.endTimeNs,
      )
    ) {
      continue;
    }

    yield decodedMessage;

    count += 1;
    if (request.limit !== undefined && count >= request.limit) {
      return;
    }
  }
}
