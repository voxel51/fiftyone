import type { DecodeClient } from "../../../../query/decoding";
import { consumeMcapBoundedGrant } from "../../reader/consume-bounded-grant";
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
    ...(request.preferredTimeNs !== undefined
      ? { preferredTimeNs: request.preferredTimeNs }
      : {}),
    signal,
    ...(request.skipOversizedSourceUnit
      ? { skipOversizedSourceUnit: true }
      : {}),
    startTimeNs: request.startTimeNs,
    topics: request.topics,
  });
  const messages: McapDecodedMessage[] = [];
  await consumeMcapBoundedGrant({
    items: result.messages,
    onItem: async (message) => {
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
    },
    signal,
    usage: () => ({
      ...result.usage,
      messagesDecoded: messages.length,
    }),
  });
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
    ...(result.skippedByTopic && result.skippedByTopic.size > 0
      ? { unavailableByTopic: result.skippedByTopic }
      : {}),
  };
}
