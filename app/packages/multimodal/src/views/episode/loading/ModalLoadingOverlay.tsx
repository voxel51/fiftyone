import type { SampleRendererLoadingProps } from "@fiftyone/plugins";
import { collectTileIds, useTiling } from "@fiftyone/tiling";
import { useLayoutEffect } from "react";
import { EpisodeModalLoading } from "./EpisodeModalLoading";
import styles from "../shell/ModalRenderer.module.css";
import { useDestinationVisit } from "./destination-visit";
import { useLoadingLayout } from "./loading-layout";
import {
  useHasPresentedFrame,
  useUnavailableFrameTiles,
} from "../../../visualization/webgpu/FramePresentation";

/**
 * Covers the media viewport until the destination can show its own state:
 * a media frame paints, a visible media pane reaches a final empty or error
 * state, or the layout has no media pane to wait for. Pending source work
 * keeps the cover because the shell hides media surfaces until playhead data
 * is ready; the visit watchdog is the backstop for work that never settles.
 */
export function ModalLoadingOverlay({
  identity,
  pending,
}: {
  readonly identity: SampleRendererLoadingProps;
  readonly pending: boolean;
}) {
  const { expandedTileId, layout, tiles } = useTiling();
  const planned = useLoadingLayout(identity);
  const presented = useHasPresentedFrame();
  const unavailable = useUnavailableFrameTiles();
  const { settle, settled } = useDestinationVisit();
  const visibleIds = expandedTileId ? [expandedTileId] : collectTileIds(layout);
  const mediaIds = visibleIds.filter(
    (id) => tiles[id]?.type === "image" || tiles[id]?.type === "3d",
  );
  const outcome =
    !pending &&
    (presented ||
      mediaIds.length === 0 ||
      mediaIds.some((id) => unavailable.has(id)));
  // This layout effect latches the visit before paint so a URL renewal, a
  // retry, or a later seek cannot bring the cover back.
  useLayoutEffect(() => {
    if (outcome) settle();
  }, [outcome, settle]);
  return settled || outcome ? null : (
    <div className={styles.loadingOverlay}>
      <EpisodeModalLoading
        {...identity}
        viewportOnly
        layout={
          pending && planned.layout
            ? planned
            : {
                ...planned,
                layout: expandedTileId ?? layout,
                titles: Object.fromEntries(
                  Object.entries(tiles).map(([id, tile]) => [id, tile.title]),
                ),
              }
        }
      />
    </div>
  );
}
