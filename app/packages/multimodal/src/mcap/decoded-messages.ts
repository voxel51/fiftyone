import type { DecodeResourceClient } from "../client/resources";
import { isWithinRange } from "./sync";
import { decodeMcapMessage } from "./message-decoder";
import type {
  McapActiveTimeline,
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
} from "./types";
import type { McapIndexedReaderLike } from "./reader";

/**
 * Streams decoded MCAP messages for one read request.
 */
export async function* readMcapDecodedMessages({
  activeTimeline,
  decodeClient,
  reader,
  request,
}: {
  readonly activeTimeline: McapActiveTimeline;
  readonly decodeClient: DecodeResourceClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadDecodedMessagesRequest;
}): AsyncGenerator<McapDecodedMessage, void, void> {
  let count = 0;

  for await (const message of reader.readMessages({
    endTime: request.endTimeNs,
    startTime: request.startTimeNs,
    topics: request.topics,
  })) {
    const decodedMessage = await decodeMcapMessage({
      activeTimeline,
      decodeClient,
      message,
      reader,
      source: request.source,
    });

    if (
      !isWithinRange(
        decodedMessage.timelineTimeNs,
        request.startTimeNs,
        request.endTimeNs
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
