/**
 * Timing helpers for Foxglove protobuf decoders.
 *
 * MCAP records provide transport timestamps, while Foxglove payloads can carry
 * message-level timestamps. This module merges both sources into the generic
 * decoded timing shape consumed by synchronized playback.
 */
import type {
  DecodedSourceTimestamps,
  DecodedTiming,
} from "../../../../decoders";
import { asRecord, optionalBigInt, optionalContextRecord } from "./records";

const NANOSECONDS_PER_SECOND = 1000000000n;

interface DecodeTimingContext {
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly timeRangeStartKey?: string;
  readonly timeRangeStartNs?: bigint;
}

/**
 * Build generic decoded timing from decoder context plus an optional timestamp
 * embedded in the Foxglove message payload.
 */
export function timingFromContext(
  context: unknown,
  messageTimestampNs: bigint | undefined
): DecodedTiming {
  const timingContext = timingContextFromContext(context);
  const sourceTimestamps: Record<string, bigint> = {
    ...(timingContext?.sourceTimestamps ?? {}),
  };
  if (messageTimestampNs !== undefined) {
    sourceTimestamps.messageTime = messageTimestampNs;
  }
  const startNs =
    timingContext?.timeRangeStartNs ??
    (timingContext?.timeRangeStartKey
      ? sourceTimestamps[timingContext.timeRangeStartKey]
      : undefined) ??
    messageTimestampNs;

  return {
    sourceTimestamps: sourceTimestamps as DecodedSourceTimestamps,
    timeRange: startNs !== undefined ? { startNs } : undefined,
  };
}

/**
 * Convert a protobuf Timestamp-like record into nanoseconds.
 */
export function timestampNs(timestamp: Record<string, unknown> | undefined) {
  if (!timestamp) {
    return undefined;
  }

  const seconds = optionalBigInt(timestamp, "seconds") ?? 0n;
  const nanos = optionalBigInt(timestamp, "nanos") ?? 0n;

  return seconds * NANOSECONDS_PER_SECOND + nanos;
}

function timingContextFromContext(
  context: unknown
): DecodeTimingContext | undefined {
  const record = optionalContextRecord(context);
  if (!record) {
    return undefined;
  }

  const sourceTimestamps = sourceTimestampsFromValue(record.sourceTimestamps);
  const timeRangeStartKey =
    typeof record.timeRangeStartKey === "string"
      ? record.timeRangeStartKey
      : undefined;
  const timeRangeStartNs =
    typeof record.timeRangeStartNs === "bigint"
      ? record.timeRangeStartNs
      : undefined;

  return {
    sourceTimestamps,
    timeRangeStartKey,
    timeRangeStartNs,
  };
}

function sourceTimestampsFromValue(
  value: unknown
): DecodedSourceTimestamps | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const record = asRecord(value);
  const sourceTimestamps: Record<string, bigint> = {};
  for (const [key, timestamp] of Object.entries(record)) {
    if (typeof timestamp !== "bigint") {
      throw new Error(`Source timestamp '${key}' is not a bigint`);
    }
    sourceTimestamps[key] = timestamp;
  }

  return sourceTimestamps;
}
