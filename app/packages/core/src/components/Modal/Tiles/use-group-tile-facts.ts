import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import type { GroupTileFacts } from "./group-tile-catalog";
import { GROUP_TILE_TYPE } from "./tile-types";

/** Reads what the current dataset makes available as tiles. */
export function useGroupTileFacts(): GroupTileFacts {
  const dynamic = fos.useIsDynamicGroup();
  const only3d = fos.useOnly3d();
  const has3dSlice = fos.useHas3dSlice();
  const mediaTypes = fos.useGroupMediaTypesSet();
  const [carouselSeed] = fos.useGroupCarouselVisibleSetting();
  const mediaSeed = fos.useIsGroupMain2dViewerVisibleSetting();
  const threeDSeed = fos.useIs3dVisibleSetting();
  const mediaAvailable = !has3dSlice || mediaTypes.size > 1;

  return useMemo(
    () => ({
      dynamic,
      has3dSlice,
      only3d,
      mediaAvailable,
      seedVisible: {
        [GROUP_TILE_TYPE.CAROUSEL]: carouselSeed,
        [GROUP_TILE_TYPE.MEDIA]: mediaSeed,
        [GROUP_TILE_TYPE.THREE_D]: threeDSeed,
        [GROUP_TILE_TYPE.SAMPLE]: true,
      },
    }),
    [
      carouselSeed,
      dynamic,
      has3dSlice,
      mediaAvailable,
      mediaSeed,
      only3d,
      threeDSeed,
    ],
  );
}
