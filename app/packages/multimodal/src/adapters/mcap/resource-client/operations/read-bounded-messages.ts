import type { DecodeClient } from "../../../../query/decoding";
import { isEpisodeReadCancelledError } from "../../../../ports";
import {
  isMcapBoundedReadCancelledError,
  McapBoundedReadCancelledError,
} from "../../reader/bounded-read-cancellation";
import {
  type McapIndexedReaderLike,
  type McapReadContinuation,
} from "../../reader";
import type {
  McapDecodedMessage,
  McapReadBoundedMessagesRequest,
  McapReadBoundedMessagesResult,
} from "../../contracts";
import { decodeMcapMessage } from "../message-decoder";
import type { McapTimelineStrategy } from "../timeline";

/** Decodes one already-admitted raw MCAP grant. */
export async function readMcapBoundedMessages({
  decodeClient,
  reader,
  request,
  signal,
  timeline,
}: {
  readonly decodeClient: DecodeClient;
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadBoundedMessagesRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapReadBoundedMessagesResult> {
  if (!reader.readBoundedMessages) {
    throw new Error("MCAP bounded reads are unavailable for this reader");
  }
  const result = await reader.readBoundedMessages({
    absoluteBudget: request.absoluteBudget,
    absoluteMaxChunks: request.absoluteMaxChunks,
    ...(request.admissionEndNs !== undefined
      ? { admissionEndNs: request.admissionEndNs }
      : {}),
    budget: request.budget,
    continuation: request.continuation as McapReadContinuation | undefined,
    endTimeNs: request.endTimeNs,
    maxChunks: request.maxChunks,
    signal,
    startTimeNs: request.startTimeNs,
    topics: request.topics,
  });
  const messages: McapDecodedMessage[] = [];
  try {
    // The raw chunk executor may have completed just before a worker cancel
    // message arrived. Yield before payload decode/result delivery so that
    // cancellation still suppresses an obsolete history result.
    await yieldToCancellation();
    throwIfAborted(signal);
    for (const [index, message] of result.messages.entries()) {
      if (index > 0 && index % 32 === 0) {
        await yieldToCancellation();
      }
      throwIfAborted(signal);
      messages.push(
        await decodeMcapMessage({
          decodeClient,
          message,
          reader,
          signal,
          source: request.source,
          timeline,
        }),
      );
      throwIfAborted(signal);
    }
  } catch (error) {
    if (
      signal?.aborted ||
      isEpisodeReadCancelledError(error) ||
      isMcapBoundedReadCancelledError(error)
    ) {
      throw new McapBoundedReadCancelledError({
        ...result.usage,
        messagesDecoded: messages.length,
      });
    }
    throw error;
  }
  return {
    ...(result.continuation ? { continuation: result.continuation } : {}),
    coverageByTopic: result.coverageByTopic,
    messages,
    ...(result.resumeAtNs !== undefined
      ? { resumeAtNs: result.resumeAtNs }
      : {}),
    stopReason: result.stopReason,
    usage: {
      ...result.usage,
      messagesDecoded: messages.length,
    },
  };
}

function yieldToCancellation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("MCAP bounded read aborted");
  error.name = "AbortError";
  throw error;
}
