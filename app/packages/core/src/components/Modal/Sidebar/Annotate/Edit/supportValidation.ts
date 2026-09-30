export type SupportBound = "start" | "stop";

export interface Span {
  start?: number;
  stop?: number;
}

/**
 * Validates a TemporalDetection's `[start, stop]` frame support the way the
 * SDK's `FrameSupportField` does: whole frame numbers with `1 <= start <= stop`.
 * With a known `frameCount`, the span also may not reach past the video's last
 * frame. Returns the message to show, or `null` when the span is valid.
 */
export const supportError = (
  start: number,
  stop: number,
  frameCount?: number | null,
): string | null => {
  if (!Number.isInteger(start) || !Number.isInteger(stop)) {
    return "frame numbers must be whole numbers";
  }

  if (start < 1) {
    return "start must be at least 1";
  }

  if (start > stop) {
    return "start must not be after stop";
  }

  if (
    typeof frameCount === "number" &&
    Number.isFinite(frameCount) &&
    frameCount > 0 &&
    stop > frameCount
  ) {
    return `stop must be at most ${frameCount}`;
  }

  return null;
};

export interface SupportIssue {
  bound: SupportBound;
  message: string;
}

/** The bound the user edited, i.e. where a message belongs. */
export const changedBound = (current: Span, next: Span): SupportBound =>
  next.stop !== current.stop ? "stop" : "start";

/**
 * The issue for an edit from the `displayed` span to `next`, placed under the
 * edited bound. Compared against what is on screen, not the stored span, since
 * an earlier invalid edit leaves the two apart.
 */
export const supportIssue = (
  displayed: Span,
  next: Required<Span>,
  frameCount?: number | null,
): SupportIssue | null => {
  const message = supportError(next.start, next.stop, frameCount);
  return message ? { bound: changedBound(displayed, next), message } : null;
};
