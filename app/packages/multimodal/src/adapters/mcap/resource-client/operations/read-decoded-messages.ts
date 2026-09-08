import type { DecodeClient } from "../../../../query/decoding/index";
import { isWithinRange } from "../../synchronization/policy";
import { decodeMcapMessage } from "../message-decoder";
import type { McapIndexedReaderLike } from "../../reader/index";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
} from "../../contracts/index";
import { throwIfAborted } from "../../../../utils/cancellation";

/**
 * Streams decoded MCAP messages for one read request.
 */
export async function* readMcapDecodedMessages({
  decodeClient,
  readSignal,
  reader,
  request,
  timeline,
  signal,
}: {
  readonly decodeClient: DecodeClient;
  readonly readSignal?: { readonly current: AbortSignal | null };
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadDecodedMessagesRequest;
  readonly timeline: McapTimelineStrategy;
  readonly signal?: AbortSignal;
}): AsyncGenerator<McapDecodedMessage, void, void> {
  throwIfAborted(signal ?? readSignal?.current);
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

  // Limited reads may stop after the first chunk, so only unbounded window
  // reads warm the byte layer ahead of the serial read loop.
  if (request.limit === undefined) {
    void reader.prefetchWindow?.({
      endTimeNs: endTime,
      startTimeNs: startTime,
      topics: request.topics,
    });
  }

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: request.topics,
  })) {
    throwIfAborted(signal ?? readSignal?.current);
    const decodedMessage = await decodeMcapMessage({
      decodeClient,
      message,
      reader,
      signal: signal ?? readSignal?.current ?? undefined,
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

    throwIfAborted(signal ?? readSignal?.current);

    count += 1;
    if (request.limit !== undefined && count >= request.limit) {
      return;
    }
  }
}
