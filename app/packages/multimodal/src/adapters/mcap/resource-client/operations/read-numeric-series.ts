import {
  McapBoundedReadCancelledError,
  type McapIndexedReaderLike,
  type McapReadContinuation,
} from "../../reader/index";
import {
  genericRecordDecoderForChannel,
  mcapChannelForTopic,
} from "../generic-record-decoder";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapNumericSeriesField,
  McapNumericSeriesResult,
  McapNumericSeriesSliceResult,
  McapNumericTopicSeries,
  McapReadNumericSeriesRequest,
  McapReadNumericSeriesSliceRequest,
} from "../../contracts/index";
import type { ReadWorkUsage } from "../../../../ports";
import { decimateMinMax } from "../numeric-series-decimate";
import { mcapTimelineRangeFromReader } from "./read-timeline-range";

/**
 * Default post-decimation point budget per field — roughly 2× the
 * pixel width of a wide tile, so min-max buckets stay sub-pixel.
 */
export const DEFAULT_NUMERIC_SERIES_MAX_POINTS = 4_000;

/**
 * Hard cap on messages decoded per extraction. Beyond this a stride
 * (when the summary knows the count) or an early stop bounds the scan;
 * either way the result reports `truncated`.
 */
const MAX_SCAN_MESSAGES = 500_000;

/**
 * Projects one dotted field path from a decoded message record. Numeric path
 * segments index arrays, so `position.0` selects the first array element.
 * Numbers must be finite; booleans map to 0/1; 64-bit values
 * (protobufjs Long, bigint) coerce through `Number` and lose precision
 * beyond 2^53 — acceptable for plotting. Returns undefined for
 * Missing, non-numeric, or whole-array paths return undefined.
 */
export function projectNumericField(
  record: Record<string, unknown>,
  pathSegments: readonly string[],
): number | undefined {
  let current: unknown = record;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    if (Array.isArray(current) || isNumericTypedArray(current)) {
      const index = arrayIndex(segment);
      if (index === undefined || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current === "number") {
    return Number.isFinite(current) ? current : undefined;
  }
  if (typeof current === "boolean") {
    return current ? 1 : 0;
  }
  if (typeof current === "bigint") {
    return Number(current);
  }
  if (
    current !== null &&
    typeof current === "object" &&
    "toNumber" in current &&
    typeof (current as { toNumber: unknown }).toNumber === "function"
  ) {
    const value = (current as { toNumber: () => number }).toNumber();
    return Number.isFinite(value) ? value : undefined;
  }

  return undefined;
}

function arrayIndex(segment: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    return undefined;
  }
  const index = Number(segment);
  return Number.isSafeInteger(index) ? index : undefined;
}

function isNumericTypedArray(value: object): value is Exclude<
  ArrayBufferView,
  DataView | Uint8Array
> & {
  readonly [index: number]: number | bigint;
  readonly length: number;
} {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(value instanceof Uint8Array) &&
    "length" in value &&
    typeof value.length === "number"
  );
}

/**
 * Extracts a packed numeric time series for one topic's field paths in
 * a single indexed-read pass. Decodes generically — protobuf channels
 * through the cached descriptor type, JSON channels through `JSON.parse`,
 * and ROS channels through cached schema readers — independent of the
 * decoder registry, since telemetry topics usually have no registered
 * visualization decoder. Messages that fail to decode contribute NaN gap
 * points rather than aborting the series.
 */
export async function readMcapNumericSeries({
  reader,
  request,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadNumericSeriesRequest;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapNumericSeriesResult> {
  if (request.fieldPaths.length === 0) {
    throw new Error("Numeric series request requires at least one field path");
  }

  const channel = mcapChannelForTopic(reader, request.topic);
  const decodeRecord = genericRecordDecoderForChannel(reader, channel);
  if (!decodeRecord) {
    throw new Error(
      `Numeric series extraction does not support encoding '${channel.messageEncoding}'`,
    );
  }
  const baseTimeNs = mcapTimelineRangeFromReader(reader, timeline).startTimeNs;
  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });

  // The scan stride keeps unbounded-rate topics affordable: when the
  // summary knows the message count, spread the cap across the whole
  // range instead of stopping early and losing the tail.
  const recordCount = channelRecordCount(reader, channel.id);
  const stride =
    recordCount !== undefined && recordCount > MAX_SCAN_MESSAGES
      ? Math.ceil(recordCount / MAX_SCAN_MESSAGES)
      : 1;

  void reader.prefetchWindow?.({
    endTimeNs: endTime,
    startTimeNs: startTime,
    topics: [request.topic],
  });

  const pathSegments = request.fieldPaths.map((path) => path.split("."));
  const times: number[] = [];
  const valuesByField: number[][] = request.fieldPaths.map(() => []);
  let seen = 0;
  let truncated = stride > 1;

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [request.topic],
  })) {
    seen += 1;
    if (stride > 1 && (seen - 1) % stride !== 0) {
      continue;
    }
    if (times.length >= MAX_SCAN_MESSAGES) {
      truncated = true;
      break;
    }

    const deltaNs = timeline.messageTimeNs(message) - baseTimeNs;
    // Split whole seconds from the sub-second remainder before casting
    // so multi-day recordings keep full precision.
    times.push(
      Number(deltaNs / 1_000_000_000n) +
        Number(deltaNs % 1_000_000_000n) / 1_000_000_000,
    );

    let record: Record<string, unknown> | undefined;
    try {
      record = decodeRecord(message.data);
    } catch {
      record = undefined;
    }

    for (let field = 0; field < pathSegments.length; field += 1) {
      const value = record
        ? projectNumericField(record, pathSegments[field])
        : undefined;
      valuesByField[field].push(value ?? Number.NaN);
    }
  }

  const maxPoints =
    request.maxPointsPerField ?? DEFAULT_NUMERIC_SERIES_MAX_POINTS;
  const sharedTimes = Float64Array.from(times);
  const fields: McapNumericSeriesField[] = request.fieldPaths.map(
    (path, index) => {
      const decimated = decimateMinMax(
        sharedTimes,
        Float64Array.from(valuesByField[index]),
        maxPoints,
      );
      return { path, timesSec: decimated.times, values: decimated.values };
    },
  );

  return {
    baseTimeNs,
    fields,
    messageCount: times.length,
    topic: request.topic,
    truncated,
  };
}

/**
 * Extracts one exact, continuation-paged numeric grant for multiple topics.
 * The bounded reader owns physical admission and traverses every selected
 * multi-topic chunk once; projection then fans those decoded messages out to
 * the requested fields.
 */
export async function readMcapNumericSeriesSlice({
  reader,
  request,
  signal,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadNumericSeriesSliceRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapNumericSeriesSliceResult> {
  if (request.selections.length === 0) {
    throw new Error("Numeric series slice requires at least one selection");
  }
  if (!reader.readBoundedMessages) {
    throw new Error("MCAP bounded reads are unavailable for numeric series");
  }

  const selectionsByChannelId = new Map<
    number,
    {
      readonly decodeRecord: (data: Uint8Array) => Record<string, unknown>;
      readonly fieldPaths: readonly string[];
      readonly pathSegments: readonly (readonly string[])[];
      readonly topic: string;
    }
  >();
  const seenTopics = new Set<string>();
  for (const selection of request.selections) {
    if (selection.fieldPaths.length === 0) {
      throw new Error(
        `Numeric series slice topic '${selection.topic}' has no field paths`,
      );
    }
    if (seenTopics.has(selection.topic)) {
      throw new Error(
        `Numeric series slice contains duplicate topic '${selection.topic}'`,
      );
    }
    seenTopics.add(selection.topic);
    const channel = mcapChannelForTopic(reader, selection.topic);
    const decodeRecord = genericRecordDecoderForChannel(reader, channel);
    if (!decodeRecord) {
      throw new Error(
        `Numeric series extraction does not support encoding '${channel.messageEncoding}'`,
      );
    }
    selectionsByChannelId.set(channel.id, {
      decodeRecord,
      fieldPaths: selection.fieldPaths,
      pathSegments: selection.fieldPaths.map((path) => path.split(".")),
      topic: selection.topic,
    });
  }

  const { endTime, startTime } = timeline.messageReadRange({
    endTimeNs: request.endTimeNs,
    startTimeNs: request.startTimeNs,
  });
  const boundedRequest = {
    absoluteBudget: request.absoluteBudget,
    absoluteMaxChunks: request.absoluteMaxChunks,
    budget: request.budget,
    continuation: request.continuation as McapReadContinuation | undefined,
    endTimeNs: endTime,
    maxChunks: request.maxChunks,
    preferredTimeNs: request.preferredTimeNs,
    signal,
    startTimeNs: startTime,
    topics: request.selections.map((selection) => selection.topic),
  };
  const first = await reader.readBoundedMessages(boundedRequest);
  let bounded = first;
  let usage = first.usage;

  // A normal grant smaller than one overlap group must not create a
  // zero-progress continuation loop. Escalate exactly one group to the
  // declared absolute source-unit ceiling; the absolute ceiling remains hard.
  if (
    first.stopReason === "budget-exhausted" &&
    first.continuation &&
    first.usage.chunksOpened === 0
  ) {
    const escalated = await reader.readBoundedMessages({
      ...boundedRequest,
      budget: request.absoluteBudget,
      maxChunks: request.absoluteMaxChunks,
      maxGroups: 1,
    });
    bounded = escalated;
    usage = addReadUsage(first.usage, escalated.usage);
  }

  const baseTimeNs = mcapTimelineRangeFromReader(reader, timeline).startTimeNs;
  const accumulators = new Map<
    number,
    {
      readonly times: number[];
      readonly valuesByField: number[][];
      messageCount: number;
    }
  >(
    [...selectionsByChannelId].map(([channelId, selection]) => [
      channelId,
      {
        messageCount: 0,
        times: [],
        valuesByField: selection.fieldPaths.map(() => []),
      },
    ]),
  );

  try {
    await yieldToCancellation();
    throwIfAborted(signal);
    for (const [index, message] of bounded.messages.entries()) {
      if (index > 0 && index % 32 === 0) {
        await yieldToCancellation();
      }
      throwIfAborted(signal);
      const selection = selectionsByChannelId.get(message.channelId);
      const accumulator = accumulators.get(message.channelId);
      if (!selection || !accumulator) {
        continue;
      }
      const deltaNs = timeline.messageTimeNs(message) - baseTimeNs;
      accumulator.times.push(
        Number(deltaNs / 1_000_000_000n) +
          Number(deltaNs % 1_000_000_000n) / 1_000_000_000,
      );
      accumulator.messageCount += 1;

      let record: Record<string, unknown> | undefined;
      try {
        record = selection.decodeRecord(message.data);
      } catch {
        record = undefined;
      }
      for (let field = 0; field < selection.pathSegments.length; field += 1) {
        const value = record
          ? projectNumericField(record, selection.pathSegments[field])
          : undefined;
        accumulator.valuesByField[field].push(value ?? Number.NaN);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new McapBoundedReadCancelledError(usage);
    }
    throw error;
  }

  const maxPoints =
    request.maxPointsPerField ?? DEFAULT_NUMERIC_SERIES_MAX_POINTS;
  const series: McapNumericTopicSeries[] = [];
  for (const [channelId, selection] of selectionsByChannelId) {
    const accumulator = accumulators.get(channelId);
    if (!accumulator) {
      continue;
    }
    const sharedTimes = Float64Array.from(accumulator.times);
    series.push({
      fields: selection.fieldPaths.map((path, index) => {
        const decimated = decimateMinMax(
          sharedTimes,
          Float64Array.from(accumulator.valuesByField[index]),
          maxPoints,
        );
        return {
          path,
          timesSec: decimated.times,
          values: decimated.values,
        };
      }),
      messageCount: accumulator.messageCount,
      topic: selection.topic,
    });
  }

  return {
    baseTimeNs,
    ...(bounded.continuation ? { continuation: bounded.continuation } : {}),
    coverageByTopic: bounded.coverageByTopic,
    series,
    stopReason: bounded.stopReason,
    usage,
  };
}

function addReadUsage(
  left: ReadWorkUsage,
  right: ReadWorkUsage,
): ReadWorkUsage {
  return {
    chunksOpened: left.chunksOpened + right.chunksOpened,
    decompressedBytes: left.decompressedBytes + right.decompressedBytes,
    decompressionCacheHits:
      left.decompressionCacheHits + right.decompressionCacheHits,
    elapsedMs: left.elapsedMs + right.elapsedMs,
    logicalSourceBytes: left.logicalSourceBytes + right.logicalSourceBytes,
    logicalUncompressedBytes:
      left.logicalUncompressedBytes + right.logicalUncompressedBytes,
    messagesDecoded: left.messagesDecoded + right.messagesDecoded,
    transferredBytes: left.transferredBytes + right.transferredBytes,
  };
}

function yieldToCancellation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("MCAP numeric series slice aborted");
  error.name = "AbortError";
  throw error;
}

function channelRecordCount(
  reader: McapIndexedReaderLike,
  channelId: number,
): number | undefined {
  const count = reader.statistics?.channelMessageCounts?.get(channelId);
  return count === undefined ? undefined : Number(count);
}
