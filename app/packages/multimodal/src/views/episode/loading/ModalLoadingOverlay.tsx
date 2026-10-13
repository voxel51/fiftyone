import type { SampleRendererLoadingProps } from "@fiftyone/plugins";
import { collectTileIds, useTiling } from "@fiftyone/tiling";
import { EpisodeModalLoading } from "./EpisodeModalLoading";
import styles from "../shell/ModalRenderer.module.css";
import { useLoadingLayout } from "./loading-layout";
import { useUnavailableFrameTiles } from "../../../visualization/webgpu/FramePresentation";

/** Keeps the preview until a destination frame paints, without gating non-media layouts. */
export function ModalLoadingOverlay({
  identity,
  pending,
  presented,
}: {
  readonly identity: SampleRendererLoadingProps;
  readonly pending: boolean;
  readonly presented: boolean;
}) {
  const { expandedTileId, layout, tiles } = useTiling();
  const planned = useLoadingLayout(identity);
  const unavailable = useUnavailableFrameTiles();
  const visibleIds = expandedTileId ? [expandedTileId] : collectTileIds(layout);
  const expectsFrame = visibleIds.some(
    (id) =>
      !unavailable.has(id) &&
      (tiles[id]?.type === "image" || tiles[id]?.type === "3d"),
  );
  return pending || (expectsFrame && !presented) ? (
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
  ) : null;
}
