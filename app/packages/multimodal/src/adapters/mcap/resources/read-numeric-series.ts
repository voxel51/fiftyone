import type { McapIndexedReaderLike } from "../reader";
import {
  genericRecordDecoderForChannel,
  mcapChannelForTopic,
} from "./generic-record-decoder";
import type { McapTimelineStrategy } from "../timeline";
import type {
  McapNumericSeriesField,
  McapNumericSeriesResult,
  McapReadNumericSeriesRequest,
} from "../types";
import { decimateMinMax } from "./numeric-series-decimate";
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

function channelRecordCount(
  reader: McapIndexedReaderLike,
  channelId: number,
): number | undefined {
  const count = reader.statistics?.channelMessageCounts?.get(channelId);
  return count === undefined ? undefined : Number(count);
}
