export type SupportBound = "start" | "stop";

export interface Span {
  start?: number;
  stop?: number;
}

/**
 * Validates a TemporalDetection's `[start, stop]` frame support the way the
 * SDK's `FrameSupportField` does: whole frame numbers with `1 <= start <= stop`.
 * Returns the message to show, or `null` when the span is valid.
 */
export const supportError = (start: number, stop: number): string | null => {
  if (!Number.isInteger(start) || !Number.isInteger(stop)) {
    return "frame numbers must be whole numbers";
  }

  if (start < 1) {
    return "start must be at least 1";
  }

  if (start > stop) {
    return "start must not be after stop";
  }

  return null;
};

/** The bound the user edited, i.e. where a message belongs. */
export const changedBound = (current: Span, next: Span): SupportBound =>
  next.stop !== current.stop ? "stop" : "start";
