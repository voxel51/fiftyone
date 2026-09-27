import type { IntervalTileContext } from "@fiftyone/multimodal/extensions/episode-intervals";
import {
  gridOverlayKey,
  useGridOverlays,
} from "@fiftyone/multimodal/extensions/timeline";
import { EpisodeGridOverlay } from "@fiftyone/multimodal/grid-overlay";

/**
 * One grid tile's footer lanes, whatever renders the tile: the temporal-tag
 * lane (unless `showTags` is off), then every registered lane.
 */
export function TileLanes({
  ctx,
  showTags = true,
}: {
  readonly ctx: IntervalTileContext;
  readonly showTags?: boolean;
}) {
  const overlays = useGridOverlays();
  return (
    <>
      {showTags ? <EpisodeGridOverlay ctx={ctx} /> : null}
      {overlays.map((Overlay) => (
        <Overlay key={gridOverlayKey(Overlay)} ctx={ctx} />
      ))}
    </>
  );
}
