import type { IntervalTileContext } from "../extensions/episode-intervals";
import {
  gridOverlayKey,
  useGridOverlays,
} from "../extensions/timeline/grid-overlay-registry";
import { EpisodeGridOverlay } from "./EpisodeGridOverlay";

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
