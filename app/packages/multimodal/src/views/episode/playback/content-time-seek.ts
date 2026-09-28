import type { TimelineIndex } from "../../../runtime/timeline-index";

/**
 * The playhead seconds that make the content frame at `timeNs` the one
 * presented. Everything downstream of the playhead quantizes to the
 * timeline's tick grid via nearest-tick rounding, so seeking to a content
 * time's raw seconds can land on the tick BEFORE it, and at-or-before
 * sampling then misses the very frame the time came from. Seek to the first
 * tick at-or-after the content time instead.
 */
export function timelineSecondsForContentTimeNs(
  index: TimelineIndex,
  timeNs: bigint,
): number {
  const tick = index.tickAt(index.indexAtOrAfter(timeNs));
  return index.nsToSec(tick ?? timeNs);
}
