import { segmentTimeNs } from "@fiftyone/state/src/selection/segment-time";
import { useScopedSegments } from "@fiftyone/state/src/selection/segment-hooks";
import { savedSegmentSource } from "@fiftyone/state/src/selection/segment-provenance";
import { cssVar } from "@voxel51/voodo";
import { useMemo } from "react";
import type {
  EpisodeInterval,
  EpisodeIntervalContribution,
  EpisodeIntervalSource,
  EpisodeIntervalSourceProps,
} from "./types";
import { useEpisodeTimeRange } from "./use-episode-time-range";

const SOURCE_ID = "fiftyone:saved-segments";

function SavedSegments({ ctx, children }: EpisodeIntervalSourceProps) {
  const id = ctx.sample.sample._id;
  const { active, members, loading } = useScopedSegments(id);
  const timeRange = useEpisodeTimeRange(id);
  const contribution = useMemo<EpisodeIntervalContribution>(() => {
    const intervals: EpisodeInterval[] = [];
    let first: bigint | undefined;
    for (const member of members) {
      const bounds = segmentTimeNs(member.range, {
        originNs: timeRange?.startNs,
      });
      if (!bounds) continue;
      if (first === undefined || bounds.startNs < first) first = bounds.startNs;
      const source = savedSegmentSource(member.range);
      intervals.push({
        sourceId: SOURCE_ID,
        rowKey: source.key,
        eventName: source.label,
        color: cssVar.color.text.accent,
        startNs: Number(bounds.startNs),
        endNs: Number(bounds.endNs),
      });
    }
    return {
      intervals,
      pinnedRowKeys: active
        ? [
            ...new Set(
              intervals.map(
                (interval) => interval.rowKey ?? interval.eventName,
              ),
            ),
          ]
        : undefined,
      initialSeekPending:
        active && (loading || (members.length > 0 && !timeRange)),
      initialSeekTimeNs:
        first !== undefined && timeRange
          ? first + timeRange.startNs
          : undefined,
    };
  }, [active, members, loading, timeRange]);
  return <>{children(contribution)}</>;
}

/** Frozen subset ranges share the existing tile lane and read-only timeline. */
export const savedSegmentIntervalSource: EpisodeIntervalSource = {
  id: SOURCE_ID,
  label: "Saved segments",
  order: 100,
  Component: SavedSegments,
};
