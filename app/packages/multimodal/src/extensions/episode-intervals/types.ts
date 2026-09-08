import type { SampleRendererProps } from "@fiftyone/plugins";
import type React from "react";

/**
 * One interval an episode-interval source contributes for a single sample.
 *
 * This is the entire vocabulary the shared layer has for "something that held
 * over a span of an episode": a name, a color, and a span. Nothing here knows
 * what an event, a signal, a summary, or a label tag is — those are Enterprise
 * concepts, and they reach the grid tile and the modal timeline by registering
 * a source that reduces them to this shape. Temporal tags, the one concept
 * that is open source, go through the same seam rather than around it.
 */
export interface EpisodeInterval {
  /** Id of the source that contributed it, for attribution and track ids. */
  readonly sourceId: string;
  /** Display name: the tag, event class, signal name, … */
  readonly eventName: string;
  /**
   * What makes this interval's row a row, when the display name does not.
   *
   * Rows are grouped and pinned by this; `eventName` is only what the user
   * reads. They are the same thing for a source whose names are unique, so it
   * can be omitted — but a source whose names collide must not solve that by
   * changing the name, which puts its bookkeeping on screen. The events source
   * is the case in point: event ids are scoped to a projection, so two
   * projections can legitimately both emit `hard_brake`, and the row key is
   * the `(projection, id)` pair while the label stays `hard_brake`.
   */
  readonly rowKey?: string;
  readonly color: string;
  /** Nanoseconds from the episode start. */
  readonly startNs: number;
  /**
   * Nanoseconds from the episode start. Equal to `startNs` for an instant —
   * the lane still renders that at its minimum width rather than dropping it.
   */
  readonly endNs: number;
}

/** What one source reports for the sample currently being rendered. */
export interface EpisodeIntervalContribution {
  readonly intervals: readonly EpisodeInterval[];
  /**
   * Rows to start pinned in the modal timeline — the ones the grid is filtered
   * by, named by the same key the intervals use (`rowKey`, or `eventName`
   * where a source has no separate key).
   *
   * Kept separate from `intervals` because it is derived from the filter, not
   * from the sample: it is known synchronously even when the intervals
   * themselves are still loading, which is what lets an asynchronously loaded
   * source still pin on open. A key the sample has no interval for is
   * harmless; only tracks that exist can be pinned.
   */
  readonly pinnedRowKeys?: readonly string[];
  /**
   * The source's own notion of how far the episode extends (ns), used only as
   * a fallback for the tile lane's time axis before the active format has
   * published an episode time range. A source that knows about intervals it is
   * not contributing (filtered out) should report the extent including them,
   * so narrowing a filter doesn't rescale the lane.
   */
  readonly domainEndNs?: number;
}

/** Props every source component receives. */
export interface EpisodeIntervalSourceProps {
  readonly ctx: SampleRendererProps["ctx"];
  readonly children: (
    contribution: EpisodeIntervalContribution,
  ) => React.ReactNode;
}

/**
 * One independently registered contributor of episode intervals.
 *
 * A source is a component rather than a hook so that it can mount providers
 * and own its own fetch lifecycle, and so that it can gate itself: a source
 * whose field and filter are both inactive must render `children({intervals:
 * []})` without fetching anything. The consumers mount every source
 * unconditionally, so that gate is the only thing standing between an
 * unfiltered grid and N requests per tile.
 */
export interface EpisodeIntervalSource {
  /**
   * Stable, namespaced identity (`vendor:thing`). Doubles as the timeline
   * section id and the track-id prefix, so it must contain a colon.
   */
  readonly id: string;
  /** Explicit product-policy order; import order never decides placement. */
  readonly order: number;
  /** Section label in the timeline drawer. */
  readonly label: string;
  readonly Component: React.ComponentType<EpisodeIntervalSourceProps>;
}

/** A source paired with what it reported this render. */
export interface ResolvedEpisodeIntervals {
  readonly source: EpisodeIntervalSource;
  readonly contribution: EpisodeIntervalContribution;
}
