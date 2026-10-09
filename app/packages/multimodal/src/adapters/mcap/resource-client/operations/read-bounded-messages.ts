import type { EncodedMessage, EncodedMessageChannel } from "../../../../ir";
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
import { genericRecordDecoderForChannel } from "../generic-record-decoder";
import { messageValue } from "../message-value";
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
  const records: EncodedMessage[] = [];
  const channels = new Map<number, EncodedMessageChannel>();
  const decoders = new Map<
    number,
    ReturnType<typeof genericRecordDecoderForChannel>
  >();
  const unavailableByTopic = new Map(
    [...(result.skippedByTopic ?? [])].map(([topic, ranges]) => [
      topic,
      [...ranges],
    ]),
  );
  await consumeMcapBoundedGrant({
    items: result.messages,
    onItem: async (message) => {
      if (
        request.representation === "message" ||
        request.representation === "raw-message"
      ) {
        const channel = reader.channelsById.get(message.channelId);
        if (!channel) {
          throw new Error(`MCAP channel ${message.channelId} is missing`);
        }
        // Resolve support once per channel, even for encoded delivery, so
        // unsupported inputs retain the same exact source-gap evidence.
        if (!decoders.has(channel.id)) {
          decoders.set(
            channel.id,
            genericRecordDecoderForChannel(reader, channel, { defaults: true }),
          );
        }
        const decode = decoders.get(channel.id);
        if (!decode) {
          const timeNs = timeline.messageTimeNs(message);
          const ranges = unavailableByTopic.get(channel.topic) ?? [];
          ranges.push({ startNs: timeNs, endNs: timeNs });
          unavailableByTopic.set(channel.topic, ranges);
          return;
        }
        if (request.representation === "raw-message") {
          if (!channels.has(channel.id)) {
            const schema = reader.schemasById.get(channel.schemaId);
            channels.set(channel.id, {
              channelId: channel.id,
              messageEncoding: channel.messageEncoding,
              ...(schema
                ? {
                    schemaName: schema.name,
                    schemaEncoding: schema.encoding,
                    schemaData: schema.data.slice(),
                  }
                : {}),
            });
          }
          records.push({
            channelId: channel.id,
            topic: channel.topic,
            timestampNs: timeline.messageTimeNs(message),
            logTimeNs: message.logTime,
            publishTimeNs: message.publishTime,
            sequence: message.sequence,
            // Reader views may share a cached chunk. Transfer only owned bytes.
            data: message.data.slice(),
          });
          return;
        }
        messages.push({
          activeTimeline: timeline.id,
          channelId: message.channelId,
          decoded: {
            decoderId: "mcap.message",
            decoderVersion: "1",
            output: { message: messageValue(decode(message.data)) },
            payload: {
              encoding: channel.messageEncoding,
              schema: reader.schemasById.get(channel.schemaId)?.name,
            },
          },
          encodedPayloadBytes: message.data.byteLength,
          logTimeNs: message.logTime,
          publishTimeNs: message.publishTime,
          sequence: message.sequence,
          timelineTimeNs: timeline.messageTimeNs(message),
          topic: channel.topic,
        });
        return;
      }
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
      messagesDecoded: messages.length + records.length,
    }),
  });
  return {
    ...(result.continuation ? { continuation: result.continuation } : {}),
    coverageByTopic: result.coverageByTopic,
    messages,
    ...(request.representation === "raw-message"
      ? { rawMessages: { records, channels: [...channels.values()] } }
      : {}),
    ...(result.resumeAtNs !== undefined
      ? { resumeAtNs: result.resumeAtNs }
      : {}),
    stopReason: result.stopReason,
    usage: {
      ...result.usage,
      messagesDecoded: messages.length + records.length,
    },
    ...(unavailableByTopic.size > 0 ? { unavailableByTopic } : {}),
  };
}
