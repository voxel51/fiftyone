import type { SampleRendererProps } from "@fiftyone/plugins";
import { useMemo } from "react";
import type {
  EpisodeInterval,
  ResolvedEpisodeIntervals,
} from "../extensions/episode-intervals";
import {
  EpisodeIntervalSources,
  packIntervals,
  useEpisodeTimeRange,
} from "../extensions/episode-intervals";
import { temporalTagIntervalSource } from "./temporal-tag-interval-source";
import styles from "./grid-overlay.module.css";

/** Cap the stacked levels so the lane stays compact on a small grid tile. */
const MAX_LEVELS = 3;

/** Vertical pixels per stacked level, and the mark height. */
const LEVEL_STEP = 6;
const MARK_HEIGHT = 4;

/**
 * Sources that ship in this package. Everything else arrives through the
 * registry — see `extensions/episode-intervals/types.ts`.
 */
const BUILT_IN_SOURCES = [temporalTagIntervalSource];

/**
 * Bottom-of-tile interval lane for multimodal grid previews.
 *
 * Every enabled source's intervals flatten into one shared, packed lane: one
 * `packIntervals` call over the whole flattened list, so intervals from
 * different sources share levels and enabling another source never makes the
 * tile taller. Renders nothing when no source contributes anything.
 */
export function EpisodeGridOverlay({ ctx }: SampleRendererProps) {
  return (
    <EpisodeIntervalSources builtInSources={BUILT_IN_SOURCES} ctx={ctx}>
      {(resolved) => <IntervalLane ctx={ctx} resolved={resolved} />}
    </EpisodeIntervalSources>
  );
}

function IntervalLane({
  ctx,
  resolved,
}: {
  readonly ctx: SampleRendererProps["ctx"];
  readonly resolved: readonly ResolvedEpisodeIntervals[];
}) {
  const timeRange = useEpisodeTimeRange(ctx.sample.sample._id);
  const recordingDurationNs = timeRange
    ? Number(timeRange.endNs - timeRange.startNs)
    : undefined;

  const model = useMemo(
    () => buildLaneModel(resolved, recordingDurationNs),
    [recordingDurationNs, resolved],
  );

  if (!model) return null;

  const { marks, levelCount, domainSpan } = model;

  return (
    <div className={styles.bar} data-testid="episode-grid-overlay">
      <div
        className={styles.lane}
        style={{ height: (levelCount - 1) * LEVEL_STEP + MARK_HEIGHT }}
      >
        {marks.map((mark, index) => (
          <div
            key={index}
            className={styles.mark}
            data-source={mark.interval.sourceId}
            data-testid="episode-grid-overlay-mark"
            style={{
              left: `${(mark.interval.startNs / domainSpan) * 100}%`,
              width: `${
                ((mark.interval.endNs - mark.interval.startNs) / domainSpan) *
                100
              }%`,
              bottom: mark.level * LEVEL_STEP,
              background: mark.interval.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface LaneMark {
  readonly interval: EpisodeInterval;
  readonly level: number;
}

interface LaneModel {
  readonly marks: readonly LaneMark[];
  readonly levelCount: number;
  /** Time span the lane maps left->right (ns); never zero. */
  readonly domainSpan: number;
}

/**
 * Flattens every source's intervals into one packed lane. The time axis runs
 * from 0 (recording start) to the recording end; before the active format has
 * published an episode time range, the widest extent any source reported is
 * used instead.
 */
function buildLaneModel(
  resolved: readonly ResolvedEpisodeIntervals[],
  recordingDurationNs?: number,
): LaneModel | null {
  const intervals: EpisodeInterval[] = [];
  let fallbackEnd = 0;
  for (const { contribution } of resolved) {
    if (contribution.domainEndNs && contribution.domainEndNs > fallbackEnd) {
      fallbackEnd = contribution.domainEndNs;
    }
    for (const interval of contribution.intervals) {
      if (interval.endNs > fallbackEnd) fallbackEnd = interval.endNs;
      intervals.push(interval);
    }
  }
  if (intervals.length === 0) return null;

  const { levels, levelCount } = packIntervals(
    intervals.map(({ startNs, endNs }) => ({ start: startNs, end: endNs })),
    MAX_LEVELS,
  );

  return {
    marks: intervals.map((interval, index) => ({
      interval,
      level: levels[index],
    })),
    levelCount,
    domainSpan: Math.max(recordingDurationNs ?? fallbackEnd, 1),
  };
}

export default EpisodeGridOverlay;
