import type { SampleRendererProps } from "@fiftyone/plugins";
import {
  temporalTagColor,
  useActiveTemporalTagFilterValues,
} from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import type { TemporalTag } from "../../../temporal-tags";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";
import styles from "./TemporalTagGridOverlay.module.css";

/** Cap the stacked levels so the bar stays compact on a small grid tile. */
const MAX_LEVELS = 3;

interface OverlayMark {
  readonly start: number;
  readonly end: number;
  readonly color: string;
  readonly level: number;
}

interface OverlayModel {
  readonly marks: readonly OverlayMark[];
  readonly levelCount: number;
  /** Time span the lane maps left->right (ns); never zero. */
  readonly domainSpan: number;
}

/**
 * Builds a single packed lane from a sample's temporal tags and the active
 * filter values: every filtered tag's intervals share one lane, colored per
 * tag, and overlapping intervals bump up into stacked levels (capped at
 * {@link MAX_LEVELS}). The time axis runs from 0 (recording start) to the
 * latest end across ALL of the sample's tags.
 */
function buildOverlayModel(
  temporalTags: readonly TemporalTag[],
  activeValues: readonly string[],
  colorForTag: (value: string) => string,
): OverlayModel | null {
  const active = new Set(activeValues);
  const byTag = new Map<string, { start: number; end: number }[]>();
  let domainEnd = 0;
  for (const tag of temporalTags) {
    if (tag.end > domainEnd) {
      domainEnd = tag.end;
    }
    if (!active.has(tag.tag)) {
      continue;
    }
    const intervals = byTag.get(tag.tag) ?? [];
    intervals.push({ start: tag.start, end: tag.end });
    byTag.set(tag.tag, intervals);
  }

  // Flatten every filtered tag's intervals into one list, colored per tag,
  // in active-filter order (stable).
  const flat: { start: number; end: number; color: string }[] = [];
  for (const value of activeValues) {
    const intervals = byTag.get(value);
    if (!intervals) {
      continue;
    }
    const color = colorForTag(value);
    for (const interval of intervals) {
      flat.push({ ...interval, color });
    }
  }
  if (flat.length === 0) {
    return null;
  }

  // Greedy interval packing: assign each interval (earliest first) to the
  // lowest level free at its start; overflow past MAX_LEVELS stacks onto the
  // top level rather than growing the bar unbounded.
  const order = flat
    .map((_, index) => index)
    .sort((a, b) => flat[a].start - flat[b].start || flat[a].end - flat[b].end);
  const levelEnds: number[] = [];
  const levels = new Array<number>(flat.length);
  for (const index of order) {
    const interval = flat[index];
    let assigned = levelEnds.findIndex((end) => end <= interval.start);
    if (assigned === -1) {
      if (levelEnds.length < MAX_LEVELS) {
        assigned = levelEnds.length;
        levelEnds.push(interval.end);
      } else {
        assigned = MAX_LEVELS - 1;
        levelEnds[assigned] = Math.max(levelEnds[assigned], interval.end);
      }
    } else {
      levelEnds[assigned] = interval.end;
    }
    levels[index] = assigned;
  }

  const marks = flat.map((interval, index) => ({
    start: interval.start,
    end: interval.end,
    color: interval.color,
    level: levels[index],
  }));

  return {
    marks,
    levelCount: Math.max(levelEnds.length, 1),
    domainSpan: Math.max(domainEnd, 1),
  };
}

/** Vertical pixels per stacked level, and the mark height. */
const LEVEL_STEP = 6;
const MARK_HEIGHT = 4;

/**
 * Fetches the sample's temporal tags and renders the packed lane. Split from
 * the gate below so the fetch only runs when a temporal-tag filter is active.
 */
function TemporalTagGridOverlayInner({
  ctx,
  activeValues,
}: {
  ctx: SampleRendererProps["ctx"];
  activeValues: readonly string[];
}) {
  const { temporalTags } = useSampleRendererTemporalTags(ctx);
  const colorForTag = useRecoilValue(temporalTagColor);

  const model = useMemo(
    () => buildOverlayModel(temporalTags, activeValues, colorForTag),
    [temporalTags, activeValues, colorForTag],
  );

  if (!model) {
    return null;
  }

  const { marks, levelCount, domainSpan } = model;

  return (
    <div className={styles.bar} data-testid="temporal-tag-grid-overlay">
      <div
        className={styles.lane}
        style={{ height: (levelCount - 1) * LEVEL_STEP + MARK_HEIGHT }}
      >
        {marks.map((mark, index) => (
          <div
            key={index}
            className={styles.mark}
            data-testid="temporal-tag-grid-overlay-mark"
            style={{
              left: `${(mark.start / domainSpan) * 100}%`,
              width: `${((mark.end - mark.start) / domainSpan) * 100}%`,
              bottom: mark.level * LEVEL_STEP,
              background: mark.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Bottom-of-tile overlay for MCAP grid previews: when a temporal-tag filter is
 * active, packs the filtered tags' intervals onto a single color-coded lane
 * (one color per tag; overlapping intervals bump up). Renders nothing (and
 * does no fetch) when no temporal-tag filter is active.
 */
export function TemporalTagGridOverlay({ ctx }: SampleRendererProps) {
  const activeValues = useActiveTemporalTagFilterValues();
  if (activeValues.length === 0) {
    return null;
  }
  return <TemporalTagGridOverlayInner ctx={ctx} activeValues={activeValues} />;
}

export default TemporalTagGridOverlay;
