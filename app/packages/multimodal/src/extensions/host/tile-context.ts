import type { SampleRendererProps } from "@fiftyone/plugins";

/**
 * All an interval lane needs to identify what it is drawing over.
 *
 * Deliberately not `SampleRendererProps["ctx"]`: intervals are not stored on
 * the sample and have nothing to do with how its media is rendered, so a lane
 * must not be reachable only from a sample renderer. A renderer context
 * structurally satisfies this, so the multimodal tile keeps passing its own.
 */
export interface IntervalTileContext {
  readonly dataset: { readonly datasetId: string };
  readonly sample: { readonly sample: { readonly _id: string } };
  /**
   * Where the lane is drawn. A source can serve a grid tile and the modal
   * differently — sharing one request across a page of tiles, or fetching
   * for the single open sample.
   */
  readonly surface: SampleRendererProps["ctx"]["surface"];
  /**
   * How far the tile's media runs (ns), for surfaces that know it up front.
   *
   * A multimodal tile leaves this unset and publishes an episode time range
   * once its format resolves. A video sample has no such format, and its
   * duration is already on the sample, so the lane can be put on the clip's
   * own axis instead of falling back to the extent of the intervals — which
   * would rescale the lane as tags are added.
   */
  readonly durationNs?: number;
}
