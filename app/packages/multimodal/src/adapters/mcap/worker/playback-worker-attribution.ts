import type { McapChunkReadDebugLog } from "../reader/byte-readable";
import type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapReadFrameTransformBootstrapRequest,
  McapReadFrameTransformWindowRequest,
  McapReadSynchronizedMessageBatchRequest,
  McapReadSynchronizedMessagesRequest,
  McapReadTopicsRequest,
  McapReadTopicTimeBoundsRequest,
  McapReadTimelineRangeRequest,
  McapSynchronizedMessageWindow,
} from "../types";
import type { McapFrameTransformSetWire } from "../frame-transform-types";

const TOP_CHUNK_LIMIT = 8;
const TOPIC_PREVIEW_LIMIT = 8;

export type McapPlaybackWorkerLaneName = "foreground" | "idle";

export interface McapPlaybackWorkerRequestWindow {
  readonly activeTimeline?: string;
  readonly endTimeNs?: string;
  readonly limit?: number;
  readonly mcapDataRequestId?: string;
  readonly requestedTicks?: number;
  readonly requestedTopics?: number;
  readonly startTimeNs?: string;
  readonly timeNs?: string;
  readonly timeRangeNs?: readonly [string, string];
  readonly topics?: readonly string[];
  readonly topicsTruncated?: number;
  readonly windowDurationMs?: number;
}

export interface McapPlaybackWorkerTopChunk {
  readonly chunkId: string;
  readonly chunkLengthBytes: number;
  readonly compression: string;
  readonly kinds: readonly McapChunkReadDebugLog["kind"][];
  readonly overlapBytes: number;
  readonly reads: number;
}

export interface McapPlaybackWorkerAttribution {
  readonly chunkBytes: number;
  readonly chunkMessageIndexOverlapBytes: number;
  readonly chunkOverlapBytes: number;
  readonly chunksTouched: number;
  readonly coalescedReadRequests: number;
  readonly coalescedRequestedBytes: number;
  readonly error?: string;
  readonly fetchedBytes: number;
  readonly lane: McapPlaybackWorkerLaneName;
  readonly mcapDataRequestId?: string;
  readonly ok: boolean;
  readonly operation: string;
  readonly payloadBytes: number;
  readonly priority: number;
  readonly queueDepthAtStart: number;
  readonly queueWaitMs: number;
  readonly rawPayloadBytes: number;
  readonly decodedPayloadBytes: number;
  readonly readRequests: number;
  readonly request: McapPlaybackWorkerRequestWindow;
  readonly requestedBytes: number;
  readonly requestId: number;
  readonly resultItems: number;
  readonly resultMessages: number;
  readonly resultSamples: number;
  readonly resultWindows: number;
  readonly runMs: number;
  readonly sourceKey: string;
  readonly topChunks: readonly McapPlaybackWorkerTopChunk[];
  readonly transferables: number;
}

export interface McapPlaybackWorkerAttributionContext {
  readonly lane: McapPlaybackWorkerLaneName;
  readonly queueDepthAtStart: number;
  readonly queueWaitMs: number;
  readonly sourceKey: string;
  readonly startedAtMs: number;
}

export interface McapPlaybackWorkerAttributionCollector {
  finish(options: {
    readonly error?: string;
    readonly nowMs: number;
    readonly ok: boolean;
  }): McapPlaybackWorkerAttribution;
  recordChunkRead(entry: McapChunkReadDebugLog): void;
  recordResult(result: unknown, transferables: number): void;
}

type McapPlaybackWorkerAttributionRequest =
  | McapPlaybackWorkerAttributionRequestOf<
      "readDecodedMessages",
      McapReadDecodedMessagesRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<
      "readFrameTransformBootstrap",
      McapReadFrameTransformBootstrapRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<
      "readFrameTransformWindow",
      McapReadFrameTransformWindowRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<
      "readSynchronizedMessageBatch",
      McapReadSynchronizedMessageBatchRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<
      "readSynchronizedMessages",
      McapReadSynchronizedMessagesRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<
      "readTimelineRange",
      McapReadTimelineRangeRequest
    >
  | McapPlaybackWorkerAttributionRequestOf<"readTopics", McapReadTopicsRequest>
  | McapPlaybackWorkerAttributionRequestOf<
      "readTopicTimeBounds",
      McapReadTopicTimeBoundsRequest
    >;

type McapPlaybackWorkerAttributionRequestOf<Type extends string, Payload> = {
  readonly id: number;
  readonly payload: Payload;
  readonly priority: number;
  readonly sourceKey: string;
  readonly type: Type;
};

interface ChunkAccumulator {
  chunkLengthBytes: number;
  compression: string;
  kinds: Set<McapChunkReadDebugLog["kind"]>;
  overlapBytesByKind: Record<McapChunkReadDebugLog["kind"], number>;
  reads: number;
}

interface ResultAccumulator {
  decodedPayloadBytes: number;
  payloadBytes: number;
  rawPayloadBytes: number;
  resultItems: number;
  resultMessages: number;
  resultSamples: number;
  resultWindows: number;
  transferables: number;
}

export function createMcapPlaybackWorkerAttributionCollector(
  message: McapPlaybackWorkerAttributionRequest,
  context: McapPlaybackWorkerAttributionContext,
): McapPlaybackWorkerAttributionCollector {
  const chunkReads = new Map<string, ChunkAccumulator>();
  const chunkIds = new Set<string>();
  const readRequests = new Map<
    string,
    { readonly fetchedBytes: number; readonly requestedBytes: number }
  >();
  const coalescedReadRequests = new Map<string, number>();
  const resultTotals: ResultAccumulator = {
    decodedPayloadBytes: 0,
    payloadBytes: 0,
    rawPayloadBytes: 0,
    resultItems: 0,
    resultMessages: 0,
    resultSamples: 0,
    resultWindows: 0,
    transferables: 0,
  };

  return {
    finish({ error, nowMs, ok }) {
      const readTotals = [...readRequests.values()].reduce(
        (sum, read) => ({
          fetchedBytes: sum.fetchedBytes + read.fetchedBytes,
          requestedBytes: sum.requestedBytes + read.requestedBytes,
        }),
        { fetchedBytes: 0, requestedBytes: 0 },
      );
      const coalescedRequestedBytes = [
        ...coalescedReadRequests.values(),
      ].reduce((sum, requestedBytes) => sum + requestedBytes, 0);

      return {
        chunkBytes: totalChunkBytes(chunkReads),
        chunkMessageIndexOverlapBytes: totalOverlapBytes(
          chunkReads,
          "chunk-message-index",
        ),
        chunkOverlapBytes: totalOverlapBytes(chunkReads, "chunk"),
        chunksTouched: chunkIds.size,
        coalescedReadRequests: coalescedReadRequests.size,
        coalescedRequestedBytes,
        ...(error ? { error } : {}),
        fetchedBytes: readTotals.fetchedBytes,
        lane: context.lane,
        ...mcapDataRequestIdForWorkerRequest(message),
        ok,
        operation: message.type,
        payloadBytes: resultTotals.payloadBytes,
        priority: message.priority,
        queueDepthAtStart: context.queueDepthAtStart,
        queueWaitMs: context.queueWaitMs,
        rawPayloadBytes: resultTotals.rawPayloadBytes,
        decodedPayloadBytes: resultTotals.decodedPayloadBytes,
        readRequests: readRequests.size,
        request: summarizeWorkerRequest(message),
        requestedBytes: readTotals.requestedBytes,
        requestId: message.id,
        resultItems: resultTotals.resultItems,
        resultMessages: resultTotals.resultMessages,
        resultSamples: resultTotals.resultSamples,
        resultWindows: resultTotals.resultWindows,
        runMs: roundMs(nowMs - context.startedAtMs),
        sourceKey: context.sourceKey,
        topChunks: topChunks(chunkReads),
        transferables: resultTotals.transferables,
      };
    },

    recordChunkRead(entry) {
      const readKey = [entry.readOffset, entry.requestedBytes].join(":");
      if (entry.cacheResult === "coalesced") {
        if (!coalescedReadRequests.has(readKey)) {
          coalescedReadRequests.set(readKey, Number(entry.requestedBytes));
        }
      } else {
        const fetchedReadKey = [readKey, entry.fetchedBytes].join(":");
        if (!readRequests.has(fetchedReadKey)) {
          readRequests.set(fetchedReadKey, {
            fetchedBytes: entry.fetchedBytes,
            requestedBytes: Number(entry.requestedBytes),
          });
        }
      }

      chunkIds.add(entry.chunkId);
      const current = chunkReads.get(entry.chunkId) ?? {
        chunkLengthBytes: Number(entry.chunkLengthBytes),
        compression: entry.compression,
        kinds: new Set<McapChunkReadDebugLog["kind"]>(),
        overlapBytesByKind: {
          chunk: 0,
          "chunk-message-index": 0,
        },
        reads: 0,
      };
      current.kinds.add(entry.kind);
      current.overlapBytesByKind[entry.kind] += Number(entry.overlapBytes);
      current.reads += 1;
      chunkReads.set(entry.chunkId, current);
    },

    recordResult(result, transferables) {
      const summary = summarizeWorkerResult(result);
      resultTotals.decodedPayloadBytes += summary.decodedPayloadBytes;
      resultTotals.payloadBytes += summary.payloadBytes;
      resultTotals.rawPayloadBytes += summary.rawPayloadBytes;
      resultTotals.resultItems += summary.resultItems;
      resultTotals.resultMessages += summary.resultMessages;
      resultTotals.resultSamples += summary.resultSamples;
      resultTotals.resultWindows += summary.resultWindows;
      resultTotals.transferables += transferables;
    },
  };
}

function summarizeWorkerRequest(
  message: McapPlaybackWorkerAttributionRequest,
): McapPlaybackWorkerRequestWindow {
  switch (message.type) {
    case "readDecodedMessages":
      return summarizeDecodedMessagesRequest(message.payload);
    case "readFrameTransformBootstrap":
      return {};
    case "readFrameTransformWindow":
      return summarizeBoundedWindow(message.payload);
    case "readSynchronizedMessageBatch":
      return summarizeSynchronizedBatchRequest(message.payload);
    case "readSynchronizedMessages":
      return summarizeSynchronizedMessagesRequest(message.payload);
    case "readTimelineRange":
      return summarizeTimelineRangeRequest(message.payload);
    case "readTopics":
      return {};
    case "readTopicTimeBounds":
      return summarizeTopicTimeBoundsRequest(message.payload);
  }
}

function summarizeDecodedMessagesRequest(
  request: McapReadDecodedMessagesRequest,
): McapPlaybackWorkerRequestWindow {
  return {
    ...(request.activeTimeline
      ? { activeTimeline: request.activeTimeline }
      : {}),
    ...(request.endTimeNs !== undefined
      ? { endTimeNs: request.endTimeNs.toString() }
      : {}),
    ...(request.limit !== undefined ? { limit: request.limit } : {}),
    ...(request.startTimeNs !== undefined
      ? { startTimeNs: request.startTimeNs.toString() }
      : {}),
    ...(request.topics ? summarizeTopics(request.topics) : {}),
    ...(request.startTimeNs !== undefined && request.endTimeNs !== undefined
      ? {
          windowDurationMs: nsDurationMs(
            request.startTimeNs,
            request.endTimeNs,
          ),
        }
      : {}),
  };
}

function summarizeSynchronizedMessagesRequest(
  request: McapReadSynchronizedMessagesRequest,
): McapPlaybackWorkerRequestWindow {
  return {
    ...(request.activeTimeline
      ? { activeTimeline: request.activeTimeline }
      : {}),
    requestedTicks: 1,
    requestedTopics: request.topics.length,
    timeNs: request.timeNs.toString(),
    ...summarizeTopics(request.topics),
  };
}

function summarizeSynchronizedBatchRequest(
  request: McapReadSynchronizedMessageBatchRequest,
): McapPlaybackWorkerRequestWindow {
  const first = request.timeNs.at(0);
  const last = request.timeNs.at(-1);
  return {
    ...(request.activeTimeline
      ? { activeTimeline: request.activeTimeline }
      : {}),
    ...(request.mcapDataRequestId
      ? { mcapDataRequestId: request.mcapDataRequestId }
      : {}),
    ...(first !== undefined && last !== undefined
      ? {
          timeRangeNs: [first.toString(), last.toString()],
          windowDurationMs: nsDurationMs(first, last),
        }
      : {}),
    requestedTicks: request.timeNs.length,
    requestedTopics: request.topics.length,
    ...summarizeTopics(request.topics),
  };
}

function mcapDataRequestIdForWorkerRequest(
  message: McapPlaybackWorkerAttributionRequest,
): { readonly mcapDataRequestId?: string } {
  return message.type === "readSynchronizedMessageBatch" &&
    message.payload.mcapDataRequestId
    ? { mcapDataRequestId: message.payload.mcapDataRequestId }
    : {};
}

function summarizeBoundedWindow(
  request: McapReadFrameTransformWindowRequest,
): McapPlaybackWorkerRequestWindow {
  return {
    ...(request.activeTimeline
      ? { activeTimeline: request.activeTimeline }
      : {}),
    endTimeNs: request.endTimeNs.toString(),
    startTimeNs: request.startTimeNs.toString(),
    windowDurationMs: nsDurationMs(request.startTimeNs, request.endTimeNs),
  };
}

function summarizeTimelineRangeRequest(
  request: McapReadTimelineRangeRequest,
): McapPlaybackWorkerRequestWindow {
  return request.activeTimeline
    ? { activeTimeline: request.activeTimeline }
    : {};
}

function summarizeTopicTimeBoundsRequest(
  request: McapReadTopicTimeBoundsRequest,
): McapPlaybackWorkerRequestWindow {
  return {
    ...(request.activeTimeline
      ? { activeTimeline: request.activeTimeline }
      : {}),
    requestedTopics: request.topics.length,
    ...summarizeTopics(request.topics),
  };
}

function summarizeTopics(topics: readonly string[]) {
  const preview = topics.slice(0, TOPIC_PREVIEW_LIMIT);
  return {
    topics: preview,
    ...(topics.length > preview.length
      ? { topicsTruncated: topics.length - preview.length }
      : {}),
  };
}

function summarizeWorkerResult(result: unknown): ResultAccumulator {
  const messages = decodedMessagesFromResult(result);
  if (messages.length > 0) {
    return {
      decodedPayloadBytes: messages.reduce(
        (sum, message) =>
          sum + (message.decoded.output.resourceHints?.sizeBytes ?? 0),
        0,
      ),
      payloadBytes: messages.reduce(
        (sum, message) =>
          sum + (message.decoded.output.resourceHints?.sizeBytes ?? 0),
        0,
      ),
      rawPayloadBytes: messages.reduce(
        (sum, message) => sum + (message.encodedPayloadBytes ?? 0),
        0,
      ),
      resultItems: Array.isArray(result) ? result.length : 1,
      resultMessages: messages.length,
      resultSamples: 0,
      resultWindows: synchronizedWindowsFromResult(result).length,
      transferables: 0,
    };
  }

  const transformSet = frameTransformSetFromUnknown(result);
  if (transformSet) {
    return {
      decodedPayloadBytes: 0,
      payloadBytes:
        transformSet.encodedPayloadBytes ?? approxJsonBytes(transformSet),
      rawPayloadBytes: transformSet.encodedPayloadBytes ?? 0,
      resultItems: 1,
      resultMessages: transformSet.messageCount ?? 0,
      resultSamples: transformSet.samples.length,
      resultWindows: 0,
      transferables: 0,
    };
  }

  return {
    decodedPayloadBytes: 0,
    payloadBytes: approxJsonBytes(result),
    rawPayloadBytes: 0,
    resultItems: Array.isArray(result) ? result.length : 1,
    resultMessages: 0,
    resultSamples: 0,
    resultWindows: 0,
    transferables: 0,
  };
}

function decodedMessagesFromResult(
  result: unknown,
): readonly McapDecodedMessage[] {
  if (isDecodedMessage(result)) {
    return [result];
  }
  if (isSynchronizedWindow(result)) {
    return result.messages;
  }
  if (Array.isArray(result)) {
    return result.flatMap((item) => decodedMessagesFromResult(item));
  }

  return [];
}

function synchronizedWindowsFromResult(
  result: unknown,
): readonly McapSynchronizedMessageWindow[] {
  if (isSynchronizedWindow(result)) {
    return [result];
  }
  if (Array.isArray(result)) {
    return result.filter(isSynchronizedWindow);
  }

  return [];
}

function isSynchronizedWindow(
  value: unknown,
): value is McapSynchronizedMessageWindow {
  return Array.isArray(recordFromUnknown(value)?.messages);
}

function isDecodedMessage(value: unknown): value is McapDecodedMessage {
  const record = recordFromUnknown(value);
  return (
    typeof record?.topic === "string" &&
    typeof record?.decoded === "object" &&
    record.decoded !== null
  );
}

function frameTransformSetFromUnknown(
  value: unknown,
): McapFrameTransformSetWire | null {
  const record = recordFromUnknown(value);
  return Array.isArray(record?.samples)
    ? (value as McapFrameTransformSetWire)
    : null;
}

function totalChunkBytes(chunks: Map<string, ChunkAccumulator>): number {
  return [...chunks.values()].reduce(
    (sum, chunk) => sum + chunk.chunkLengthBytes,
    0,
  );
}

function totalOverlapBytes(
  chunks: Map<string, ChunkAccumulator>,
  kind: McapChunkReadDebugLog["kind"],
): number {
  return [...chunks.values()].reduce(
    (sum, chunk) =>
      chunk.kinds.has(kind) ? sum + chunk.overlapBytesByKind[kind] : sum,
    0,
  );
}

function topChunks(
  chunks: Map<string, ChunkAccumulator>,
): readonly McapPlaybackWorkerTopChunk[] {
  return [...chunks.entries()]
    .sort(([, left], [, right]) => chunkOverlap(right) - chunkOverlap(left))
    .slice(0, TOP_CHUNK_LIMIT)
    .map(([chunkId, chunk]) => ({
      chunkId,
      chunkLengthBytes: chunk.chunkLengthBytes,
      compression: chunk.compression,
      kinds: [...chunk.kinds].sort(),
      overlapBytes: chunkOverlap(chunk),
      reads: chunk.reads,
    }));
}

function chunkOverlap(chunk: ChunkAccumulator): number {
  return (
    chunk.overlapBytesByKind.chunk +
    chunk.overlapBytesByKind["chunk-message-index"]
  );
}

function approxJsonBytes(value: unknown): number {
  try {
    const text = JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested,
    );
    if (!text) return 0;
    return textEncoderByteLength(text);
  } catch {
    return 0;
  }
}

function textEncoderByteLength(text: string): number {
  return globalThis.TextEncoder
    ? new TextEncoder().encode(text).byteLength
    : text.length;
}

function nsDurationMs(startTimeNs: bigint, endTimeNs: bigint): number {
  return Number(((endTimeNs - startTimeNs) / 1_000_000n).toString());
}

function roundMs(value: number): number {
  return Number(value.toFixed(1));
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
