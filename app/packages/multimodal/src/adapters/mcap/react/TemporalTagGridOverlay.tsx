import type { SampleRendererProps } from "@fiftyone/plugins";
import { useActiveTemporalTagFilterValues } from "@fiftyone/state";
import { useMemo } from "react";
import type { TemporalTag } from "../../../temporal-tags";
import { useSampleRendererTemporalTags } from "../../../temporal-tags";
import styles from "./TemporalTagGridOverlay.module.css";

/** Most tag rows the bar renders; extras are summarized in the label. */
const MAX_ROWS = 3;

interface OverlayInterval {
  readonly start: number;
  readonly end: number;
}

interface OverlayRow {
  readonly tag: string;
  readonly intervals: readonly OverlayInterval[];
}

interface OverlayModel {
  readonly rows: readonly OverlayRow[];
  /** Distinct filtered tags present in this sample (may exceed MAX_ROWS). */
  readonly presentCount: number;
  /** Earliest interval start across all present filtered tags (ns). */
  readonly domainStart: number;
  /** Time span the bar maps left->right (ns); never zero. */
  readonly domainSpan: number;
}

/**
 * Builds the overlay model from a sample's temporal tags and the active
 * filter values. Rows follow active-filter order and are capped at
 * {@link MAX_ROWS}; the time axis runs from 0 (recording start) to the latest
 * end across ALL of the sample's tags, so all rows share one axis.
 *
 * NB: the axis end is the sample's last tag, not the true recording duration
 * (that isn't available per grid tile without decoding the MCAP), so a tile
 * whose last tag ends before the recording does reads slightly compressed —
 * but positions stay truthful and single intervals no longer fill the width.
 */
function buildOverlayModel(
  temporalTags: readonly TemporalTag[],
  activeValues: readonly string[],
): OverlayModel | null {
  const active = new Set(activeValues);
  const byTag = new Map<string, OverlayInterval[]>();
  for (const tag of temporalTags) {
    if (!active.has(tag.tag)) {
      continue;
    }
    const intervals = byTag.get(tag.tag) ?? [];
    intervals.push({ start: tag.start, end: tag.end });
    byTag.set(tag.tag, intervals);
  }

  // Present tags in active-filter order (stable, predictable which 3 show).
  const presentTags = activeValues.filter((value) => byTag.has(value));
  if (presentTags.length === 0) {
    return null;
  }

  // Anchor the axis at 0 (recording start) and extend to the latest end across
  // ALL of the sample's tags — not just the shown ones. Using the shown tags'
  // own min/max would make a single-interval tag define both edges and render
  // full-width; anchoring at 0 with a sample-wide end keeps positions truthful.
  let domainEnd = 0;
  for (const tag of temporalTags) {
    if (tag.end > domainEnd) {
      domainEnd = tag.end;
    }
  }

  const rows = presentTags.slice(0, MAX_ROWS).map((tag) => ({
    tag,
    intervals: byTag.get(tag) ?? [],
  }));

  return {
    rows,
    presentCount: presentTags.length,
    domainStart: 0,
    // Guard the divisor against a degenerate zero-length domain.
    domainSpan: Math.max(domainEnd, 1),
  };
}

/**
 * Fetches the sample's temporal tags and renders the overlay. Split from the
 * gate below so the fetch only runs when a temporal-tag filter is active.
 */
function TemporalTagGridOverlayInner({
  ctx,
  activeValues,
}: {
  ctx: SampleRendererProps["ctx"];
  activeValues: readonly string[];
}) {
  const { temporalTags } = useSampleRendererTemporalTags(ctx);

  const model = useMemo(
    () => buildOverlayModel(temporalTags, activeValues),
    [temporalTags, activeValues],
  );

  if (!model) {
    return null;
  }

  const { rows, presentCount, domainStart, domainSpan } = model;

  return (
    <div className={styles.bar} data-testid="temporal-tag-grid-overlay">
      {rows.map((row) => (
        <div
          key={row.tag}
          className={styles.row}
          title={row.tag}
          data-testid="temporal-tag-grid-overlay-row"
        >
          {row.intervals.map((interval, index) => (
            <div
              // Intervals for one tag have no stable id here; index is stable
              // for a given fetched list.
              key={index}
              className={styles.mark}
              style={{
                left: `${((interval.start - domainStart) / domainSpan) * 100}%`,
                width: `${((interval.end - interval.start) / domainSpan) * 100}%`,
              }}
            />
          ))}
        </div>
      ))}
      {presentCount > MAX_ROWS ? (
        <div className={styles.label}>
          Showing {MAX_ROWS} of {presentCount} filters
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bottom-of-tile overlay for MCAP grid previews: when a temporal-tag filter is
 * active, shows up to {@link MAX_ROWS} rows of orange marks indicating when the
 * filtered tags occur in the sample. Renders nothing (and does no fetch) when
 * no temporal-tag filter is active.
 */
export function TemporalTagGridOverlay({ ctx }: SampleRendererProps) {
  const activeValues = useActiveTemporalTagFilterValues();
  if (activeValues.length === 0) {
    return null;
  }
  return <TemporalTagGridOverlayInner ctx={ctx} activeValues={activeValues} />;
}

export default TemporalTagGridOverlay;
