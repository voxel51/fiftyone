import type { Track } from "@fiftyone/playback";
import {
  segmentTimeNs,
  useScopedSegments,
} from "@fiftyone/state/src/selection";
import { savedSegmentSource } from "@fiftyone/state/src/selection/segment-provenance";
import { cssVar } from "@voxel51/voodo";
import { useMemo, useRef } from "react";

const TRACK_ID = "fiftyone:saved-segments";

/** Read-only intervals on the existing video timeline, in elapsed seconds. */
export function useSavedVideoSegments(sampleId: string, frameRate?: number) {
  const { members, active, loading, error, scopeId, pinScopeKey } =
    useScopedSegments(sampleId);
  const tracks = useMemo<Track[]>(() => {
    const rows = new Map<string, Track>();
    for (const { range } of members) {
      const bounds = segmentTimeNs(range, { frameRate });
      if (!bounds) continue;
      const source = savedSegmentSource(range);
      const id = `${TRACK_ID}:${source.key}`;
      let row = rows.get(id);
      if (!row) {
        row = {
          id,
          label: source.label,
          description:
            "Saved subset ranges. The full video remains available for context.",
          color: cssVar.color.text.accent,
          events: [],
        };
        rows.set(id, row);
      }
      row.events.push({
        label: source.label,
        startSec: Number(bounds.startNs) / 1e9,
        endSec: Number(bounds.endNs) / 1e9,
      });
    }
    return [...rows.values()].map((row) => ({
      ...row,
      events: row.events.sort((a, b) => a.startSec - b.startSec),
    }));
  }, [members, frameRate]);
  // Choose an opening position once per sample/subset. Filter changes can redraw
  // its track but must not pull a viewer back after they have started browsing.
  const openingId = `${sampleId}:${scopeId ?? ""}`;
  const opening = useRef<{ id: string; time: number | null }>({
    id: openingId,
    time: null,
  });
  if (opening.current.id !== openingId)
    opening.current = { id: openingId, time: null };
  // A loaded video can lack frame metadata permanently. Its unconvertible
  // frame ranges must not prevent the ordinary opening paint at zero.
  if (opening.current.time === null && (!active || !loading)) {
    opening.current.time = tracks.length
      ? Math.min(...tracks.map((track) => track.events[0].startSec))
      : 0;
  }
  return {
    tracks,
    initialPinnedIds: useMemo(() => tracks.map((track) => track.id), [tracks]),
    initialTime: opening.current.time,
    pinScopeKey,
    error,
  };
}
