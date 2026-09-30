import type { SampleRendererProps } from "@fiftyone/plugins";

/**
 * All an interval lane needs to identify what it is drawing over. Not
 * `SampleRendererProps["ctx"]`, so a lane is reachable from tiles that have
 * no sample renderer; a renderer context satisfies it structurally.
 */
export interface IntervalTileContext {
  readonly dataset: { readonly datasetId: string };
  readonly sample: { readonly sample: { readonly _id: string } };
  /** Where the lane is drawn, which a source may serve differently. */
  readonly surface: SampleRendererProps["ctx"]["surface"];
}
