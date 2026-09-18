import type { SampleRendererProps } from "@fiftyone/plugins";

/**
 * The episode a renderer context is pointed at.
 *
 * One definition because several things key off it independently — the grid
 * passes it as a prop, each lane publishes its names under it, the embedding
 * selection looks up that tile's windows with it — and a lane that derived a
 * different id would simply never be named: no error, just an empty row.
 *
 * `ctx.sample` is the renderer's sample envelope (playback state and resolved
 * urls alongside the document); `ctx.sample.sample` is the document itself.
 * The cast is for `id`, which some sample reads return `_id` under and the
 * renderer type does not declare.
 */
export function episodeIdOf(
  ctx: SampleRendererProps["ctx"] | undefined,
): string | undefined {
  const sample = ctx?.sample?.sample as
    | { _id?: string; id?: string }
    | undefined;
  return sample?._id || sample?.id || undefined;
}
