/** Source evidence retained when a range is captured, independent of identity. */
export interface SelectionProvenance {
  readonly provider: string;
  readonly source: string;
  readonly itemId?: string;
  readonly nativeStart?: string;
  readonly nativeEnd?: string;
}

/** Exact half-open bounds on the episode's native axis; integers travel as strings. */
export interface SelectionRange {
  readonly start: string;
  readonly end: string;
  readonly timebase: string;
  readonly streams: readonly string[];
  readonly provenance: readonly SelectionProvenance[];
}

/** One captured member. Full episodes and segments may coexist in a subset. */
export type SelectionMember = {
  readonly episodeId: string;
} & (
  | { readonly kind: "episode" }
  | { readonly kind: "segment"; readonly range: SelectionRange }
);

/** A grid page's sample node, so previews can reuse the grid's renderer. */
export interface GridSampleNode {
  readonly id: string;
  readonly sample: { readonly _id: string; readonly [key: string]: unknown };
  readonly urls?: readonly {
    readonly field: string;
    readonly url: string | null;
  }[];
  readonly aspectRatio?: number | null;
}

/** The tray has exactly one exclusive scope per episode. */
export interface EpisodeSelection {
  readonly episodeId: string;
  readonly members: readonly SelectionMember[];
  readonly filepath?: string;
  readonly previewStart?: number;
  readonly unavailable?: boolean;
  /** Present when the card stands for a whole dynamic group of parents. */
  readonly group?: { readonly label: string; readonly size: number };
  /** The group this sample belongs to, in a grouped dataset. */
  readonly groupId?: string;
  /** The grid's own node when a plugin renderer draws this sample's tile. */
  readonly node?: GridSampleNode;
}

/** Built-in providers resolve on the server; extensions supply complete ranges. */
export type SegmentConstraint =
  | {
      readonly kind: "events";
      readonly field: string;
      readonly values: readonly string[];
    }
  | { readonly kind: "temporal-tags"; readonly values: readonly string[] }
  | {
      readonly kind: "ranges";
      readonly label: string;
      readonly members: readonly SelectionMember[];
    };

/** A browsing boundary is independent of explicit tray choices. */
export interface SelectionBoundary {
  readonly subsetId?: string;
  readonly subsetScope?: "episodes" | "segments";
  readonly provider?: SegmentConstraint;
}

/** Counts distinguish episode cards from actual action members. */
export interface SelectionCounts {
  readonly episodes: number;
  readonly fullEpisodes: number;
  readonly segments: number;
  readonly segmentEpisodes: number;
  readonly unavailable: number;
}
