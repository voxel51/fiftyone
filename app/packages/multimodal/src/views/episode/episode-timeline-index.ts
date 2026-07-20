import { createTimelineIndex } from "../../runtime";

/** @deprecated Use the format-neutral runtime timeline index. */
export function createEpisodeTimelineIndex(range: {
  readonly activeTimeline?: unknown;
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}) {
  if (range.endTimeNs < range.startTimeNs) {
    throw new Error("episode timeline range end cannot be before start");
  }
  return createTimelineIndex({
    endNs: range.endTimeNs,
    startNs: range.startTimeNs,
  });
}
/** @deprecated Use the format-neutral `TimelineIndex` type. */
export type { TimelineIndex as EpisodeTimelineIndex } from "../../runtime";
