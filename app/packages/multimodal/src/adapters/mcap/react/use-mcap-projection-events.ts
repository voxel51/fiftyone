import type { Track } from "@fiftyone/playback";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import {
  useSampleRendererProjectionEvents,
  type ProjectionEvent,
} from "../../../projection-events";

const NO_TRACKS: Track[] = [];

const NS_PER_SECOND = 1_000_000_000;

/** Palette shared with temporal tags for a consistent timeline look. */
const EVENT_COLORS = [
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f43f5e",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Rebases raw wall-clock nanoseconds onto the recording-relative seconds
 * the timeline renders in. Splitting whole seconds from the sub-second
 * remainder keeps full precision even when `ns - originNs` exceeds
 * `Number.MAX_SAFE_INTEGER` (multi-day recordings).
 */
function nsToRelativeSec(ns: bigint, originNs: bigint): number {
  const deltaNs = ns - originNs;
  const whole = deltaNs / 1_000_000_000n;
  const remainder = deltaNs % 1_000_000_000n;
  return Number(whole) + Number(remainder) / NS_PER_SECOND;
}

function eventsToTracks(
  events: readonly ProjectionEvent[],
  originNs: bigint,
): Track[] {
  if (events.length === 0) return NO_TRACKS;

  // Group occurrences by event id — the backend emits one logical event
  // as many short contiguous rows and does not merge them.
  const byId = new Map<string, ProjectionEvent[]>();
  for (const event of events) {
    const group = byId.get(event.id) ?? [];
    group.push(event);
    byId.set(event.id, group);
  }

  return Array.from(byId.entries()).map(([id, group]) => ({
    // Distinct id namespace from `temporal-tag::` — keeps events out of
    // the temporal-tag creation/mutation affordances (events are
    // read-only for M1).
    id: `projection-event::${id}`,
    label: group[0].name || id,
    color: EVENT_COLORS[hashId(id) % EVENT_COLORS.length],
    events: group.map((event) => ({
      label: event.name,
      startSec: nsToRelativeSec(event.startTimestampNs, originNs),
      endSec: nsToRelativeSec(event.endTimestampNs, originNs),
    })),
  }));
}

/**
 * Read-only projection-event tracks for the current sample, ready to
 * merge into the {@link TrackProvider} alongside temporal-tag tracks.
 *
 * `originNs` is the recording start in wall-clock ns; event timestamps
 * are absolute and get rebased against it so they land on the 0-based
 * timeline. The mock client emits recording-relative ns, so the default
 * `0n` renders it as-is. When the real (absolute) events API is wired,
 * pass the recording's `startTimeNs` — available inside the playback
 * tree via the MCAP timeline index.
 */
export function useMcapProjectionEvents(
  ctx: SampleRendererProps["ctx"],
  originNs = 0n,
): Track[] {
  const { events } = useSampleRendererProjectionEvents(ctx);

  return useMemo(() => eventsToTracks(events, originNs), [events, originNs]);
}
