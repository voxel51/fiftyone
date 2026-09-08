import type {
  McapIndexedReaderLike,
  McapReadContinuation,
} from "../../reader/index";
import {
  consumeMcapBoundedGrant,
  MCAP_BOUNDED_GRANT_YIELD_INTERVAL,
} from "../../reader/consume-bounded-grant";
import {
  genericRecordDecoderForChannel,
  mcapChannelsForTopic,
} from "../generic-record-decoder";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapNumericSeriesResult,
  McapNumericSeriesSliceResult,
  McapNumericTopicSeries,
  McapReadNumericSeriesRequest,
  McapReadNumericSeriesSliceRequest,
} from "../../contracts/index";
import type { ReadWorkUsage } from "../../../../ports";
import { nsDeltaToSeconds } from "../../../../utils/nanoseconds";
import {
  aggregateAlignedNumericSeries,
  numericSeriesBucketIndex,
} from "../../../../utils/numeric-series-buckets";
import { decimateMinMax } from "../numeric-series-decimate";
import { mcapTimelineRangeFromReader } from "./read-timeline-range";
import { throwIfAborted } from "../../../../utils/cancellation";
import { yieldToTask } from "../../../../utils/task-yield";

/**
 * Default post-decimation point budget per field — roughly 2× the
 * pixel width of a wide tile, so min-max buckets stay sub-pixel.
 */
const DEFAULT_NUMERIC_SERIES_MAX_POINTS = 4_000;

/**
 * Hard cap on messages decoded per extraction. Beyond this a stride
 * (when the summary knows the count) or an early stop bounds the scan;
 * either way the result reports `truncated`.
 */
const MAX_SCAN_MESSAGES = 500_000;

interface NumericSeriesAccumulator {
  readonly fieldPaths: readonly string[];
  readonly pathSegments: readonly (readonly string[])[];
  readonly timesNs: bigint[];
  readonly topic: string;
  readonly valuesByField: number[][];
  messageCount: number;
}

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
  signal,
  timeline,
}: {
  readonly reader: McapIndexedReaderLike;
  readonly request: McapReadNumericSeriesRequest;
  readonly signal?: AbortSignal;
  readonly timeline: McapTimelineStrategy;
}): Promise<McapNumericSeriesResult> {
  if (request.fieldPaths.length === 0) {
    throw new Error("Numeric series request requires at least one field path");
  }

  const channels = mcapChannelsForTopic(reader, request.topic);
  if (channels.length === 0) {
    throw new Error(`MCAP topic '${request.topic}' has no channel`);
  }
  const decodersByChannelId = new Map(
    channels.flatMap((channel) => {
      const decoder = genericRecordDecoderForChannel(reader, channel);
      return decoder ? [[channel.id, decoder] as const] : [];
    }),
  );
  if (decodersByChannelId.size === 0) {
    throw new Error(
      `Numeric series extraction does not support encoding for any channel of topic '${request.topic}'`,
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
  const recordCount = channels.reduce<number | undefined>((sum, channel) => {
    const count = channelRecordCount(reader, channel.id);
    return count === undefined || sum === undefined ? undefined : sum + count;
  }, 0);
  const stride =
    recordCount !== undefined && recordCount > MAX_SCAN_MESSAGES
      ? Math.ceil(recordCount / MAX_SCAN_MESSAGES)
      : 1;

  void reader.prefetchWindow?.({
    endTimeNs: endTime,
    startTimeNs: startTime,
    topics: [request.topic],
  });

  const accumulator = createNumericSeriesAccumulator(
    request.topic,
    request.fieldPaths,
  );
  let seen = 0;
  let truncated = stride > 1;

  for await (const message of reader.readMessages({
    endTime,
    startTime,
    topics: [request.topic],
  })) {
    if (seen > 0 && seen % MCAP_BOUNDED_GRANT_YIELD_INTERVAL === 0) {
      await yieldToTask();
    }
    throwIfAborted(signal, "MCAP numeric series read aborted");
    seen += 1;
    if (stride > 1 && (seen - 1) % stride !== 0) {
      continue;
    }
    if (accumulator.messageCount >= MAX_SCAN_MESSAGES) {
      truncated = true;
      break;
    }

    pushNumericSeriesMessage(
      accumulator,
      message.data,
      timeline.messageTimeNs(message),
      decodersByChannelId.get(message.channelId),
    );
  }
  throwIfAborted(signal, "MCAP numeric series read aborted");

  const maxPoints =
    request.maxPointsPerField ?? DEFAULT_NUMERIC_SERIES_MAX_POINTS;
  const finalized = finalizeNumericSeries(accumulator, baseTimeNs, maxPoints);

  return {
    baseTimeNs,
    fields: finalized.fields,
    messageCount: finalized.messageCount,
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
      readonly accumulator: NumericSeriesAccumulator;
      readonly decodeRecord?: (data: Uint8Array) => Record<string, unknown>;
    }
  >();
  const accumulatorsByTopic = new Map<string, NumericSeriesAccumulator>();
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
    const channels = mcapChannelsForTopic(reader, selection.topic);
    if (channels.length === 0) {
      throw new Error(`MCAP topic '${selection.topic}' has no channel`);
    }
    const accumulator = createNumericSeriesAccumulator(
      selection.topic,
      selection.fieldPaths,
    );
    const resolutions = channels.map((channel) => ({
      channel,
      decodeRecord:
        genericRecordDecoderForChannel(reader, channel) ?? undefined,
    }));
    if (!resolutions.some(({ decodeRecord }) => decodeRecord)) {
      throw new Error(
        `Numeric series extraction does not support encoding for any channel of topic '${selection.topic}'`,
      );
    }
    accumulatorsByTopic.set(selection.topic, accumulator);
    for (const { channel, decodeRecord } of resolutions) {
      selectionsByChannelId.set(channel.id, { accumulator, decodeRecord });
    }
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
  const firstMadeCoverage = [...first.coverageByTopic.values()].some(
    (ranges) => ranges.length > 0,
  );
  if (
    first.stopReason === "budget-exhausted" &&
    first.continuation &&
    !firstMadeCoverage
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
  await consumeMcapBoundedGrant({
    items: bounded.messages,
    onItem: (message) => {
      const selected = selectionsByChannelId.get(message.channelId);
      if (!selected) {
        return;
      }
      pushNumericSeriesMessage(
        selected.accumulator,
        message.data,
        timeline.messageTimeNs(message),
        selected.decodeRecord,
      );
    },
    signal,
    usage: () => usage,
  });

  const series: McapNumericTopicSeries[] = [];
  for (const accumulator of accumulatorsByTopic.values()) {
    series.push(
      finalizeAlignedNumericSeries(
        accumulator,
        baseTimeNs,
        request.bucketDurationNs,
      ),
    );
  }

  return {
    baseTimeNs,
    ...(bounded.continuation ? { continuation: bounded.continuation } : {}),
    coverageByTopic: bounded.coverageByTopic,
    ...(bounded.resumeAtNs !== undefined
      ? { resumeAtNs: bounded.resumeAtNs }
      : {}),
    skippedByTopic: bounded.skippedByTopic ?? new Map(),
    series,
    stopReason: bounded.stopReason,
    usage,
  };
}

function createNumericSeriesAccumulator(
  topic: string,
  fieldPaths: readonly string[],
): NumericSeriesAccumulator {
  return {
    fieldPaths,
    messageCount: 0,
    pathSegments: fieldPaths.map((path) => path.split(".")),
    timesNs: [],
    topic,
    valuesByField: fieldPaths.map(() => []),
  };
}

function pushNumericSeriesMessage(
  accumulator: NumericSeriesAccumulator,
  data: Uint8Array,
  timeNs: bigint,
  decodeRecord?: (data: Uint8Array) => Record<string, unknown>,
): void {
  accumulator.timesNs.push(timeNs);
  accumulator.messageCount += 1;

  let record: Record<string, unknown> | undefined;
  try {
    record = decodeRecord?.(data);
  } catch {
    record = undefined;
  }
  for (let field = 0; field < accumulator.pathSegments.length; field += 1) {
    const value = record
      ? projectNumericField(record, accumulator.pathSegments[field])
      : undefined;
    accumulator.valuesByField[field].push(value ?? Number.NaN);
  }
}

function finalizeNumericSeries(
  accumulator: NumericSeriesAccumulator,
  baseTimeNs: bigint,
  maxPoints: number,
): McapNumericTopicSeries {
  const sharedTimes = Float64Array.from(accumulator.timesNs, (timeNs) =>
    nsDeltaToSeconds(timeNs - baseTimeNs),
  );
  return {
    fields: accumulator.fieldPaths.map((path, index) => {
      const decimated = decimateMinMax(
        sharedTimes,
        Float64Array.from(accumulator.valuesByField[index]),
        maxPoints,
      );
      return {
        bucketGapMask: decimated.bucketGapMask,
        path,
        timesSec: decimated.times,
        values: decimated.values,
      };
    }),
    messageCount: accumulator.messageCount,
    topic: accumulator.topic,
  };
}

function finalizeAlignedNumericSeries(
  accumulator: NumericSeriesAccumulator,
  baseTimeNs: bigint,
  bucketDurationNs: bigint,
): McapNumericTopicSeries {
  const sharedTimes = Float64Array.from(accumulator.timesNs, (timeNs) =>
    nsDeltaToSeconds(timeNs - baseTimeNs),
  );
  const bucketIndexes = BigInt64Array.from(accumulator.timesNs, (timeNs) =>
    numericSeriesBucketIndex(timeNs, bucketDurationNs),
  );
  return {
    fields: accumulator.fieldPaths.map((path, index) => {
      const aggregated = aggregateAlignedNumericSeries(
        sharedTimes,
        Float64Array.from(accumulator.valuesByField[index]),
        baseTimeNs,
        bucketDurationNs,
        bucketIndexes,
      );
      return {
        bucketIndexes: aggregated.bucketIndexes,
        path,
        timesSec: aggregated.timesSec,
        values: aggregated.values,
      };
    }),
    messageCount: accumulator.messageCount,
    topic: accumulator.topic,
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

function channelRecordCount(
  reader: McapIndexedReaderLike,
  channelId: number,
): number | undefined {
  const count = reader.statistics?.channelMessageCounts?.get(channelId);
  return count === undefined ? undefined : Number(count);
}
