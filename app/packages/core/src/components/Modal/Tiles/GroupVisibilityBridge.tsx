import * as fos from "@fiftyone/state";
import { useTiling } from "@fiftyone/tiling";
import { useEffect, useMemo } from "react";
import { GROUP_TILE_TYPE } from "./tile-types";

/**
 * Mirrors tile presence into the legacy visibility atoms. 3D pinning, hover
 * echo and the sidebar still read `groupMediaIs*Visible`, so a closed media
 * tile must read as "2D viewer hidden" for them, exactly as the popout
 * toggle did. The 3D and 2D writes go through `useRenderConfig3dActions` so
 * the pinned-slice bookkeeping those setters do keeps happening.
 */
export const GroupVisibilityBridge = () => {
  const { tiles } = useTiling();
  const present = useMemo(() => {
    const types = new Set<string>();
    for (const tile of Object.values(tiles)) {
      if (tile.type) types.add(tile.type);
    }
    return types;
  }, [tiles]);

  const hasCarousel = present.has(GROUP_TILE_TYPE.CAROUSEL);
  const hasMedia = present.has(GROUP_TILE_TYPE.MEDIA);
  const has3d = present.has(GROUP_TILE_TYPE.THREE_D);

  const [carousel, setCarousel] = fos.useGroupCarouselVisibleSetting();
  const media = fos.useIsGroupMain2dViewerVisibleSetting();
  const threeD = fos.useIs3dVisibleSetting();
  const { setMainViewerVisible, setVisible } = fos.useRenderConfig3dActions();

  useEffect(() => {
    if (carousel !== hasCarousel) setCarousel(hasCarousel);
  }, [carousel, hasCarousel, setCarousel]);
  useEffect(() => {
    if (media !== hasMedia) void setMainViewerVisible(hasMedia);
  }, [hasMedia, media, setMainViewerVisible]);
  useEffect(() => {
    if (threeD !== has3d) void setVisible(has3d);
  }, [has3d, setVisible, threeD]);

  return null;
};
