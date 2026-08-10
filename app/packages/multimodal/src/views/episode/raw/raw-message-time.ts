import { relativeTimeParts } from "../../../utils/relative-time";

/** Formats one exact message time relative to the recording origin. */
export function formatRawMessageTime(timeNs: bigint, originNs: bigint): string {
  const { milliseconds, negative, seconds } = relativeTimeParts(
    timeNs - originNs,
  );
  return `t=${negative ? "-" : "+"}${seconds}.${milliseconds}s`;
}

/** Formats an exact nanosecond timestamp for the message-index rail. */
export function formatExactRawMessageTime(
  timeNs: bigint,
  originNs: bigint,
): string {
  const deltaNs = timeNs - originNs;
  const negative = deltaNs < 0n;
  const magnitude = negative ? -deltaNs : deltaNs;
  const seconds = magnitude / 1_000_000_000n;
  const nanoseconds = (magnitude % 1_000_000_000n).toString().padStart(9, "0");
  return `t=${negative ? "-" : "+"}${seconds}.${nanoseconds}s`;
}
