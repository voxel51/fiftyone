import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import type { GroupTileFacts } from "./group-tile-catalog";
import { GROUP_TILE_TYPE } from "./tile-types";

/** Reads what the current dataset makes available as tiles. */
export function useGroupTileFacts(): GroupTileFacts {
  const isGroup = fos.useIsGroupDataset();
  const dynamic = fos.useIsDynamicGroup();
  const annotate = fos.useModalMode() === fos.ModalMode.ANNOTATE;
  const sampleOnly = !isGroup || dynamic || annotate;
  const only3d = fos.useOnly3d();
  const has3dSlice = fos.useHas3dSlice();
  const mediaTypes = fos.useGroupMediaTypesSet();
  const [carouselSeed] = fos.useGroupCarouselVisibleSetting();
  const mediaSeed = fos.useIsGroupMain2dViewerVisibleSetting();
  const threeDSeed = fos.useIs3dVisibleSetting();
  const mediaAvailable = !has3dSlice || mediaTypes.size > 1;

  return useMemo(
    () => ({
      sampleOnly,
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
      has3dSlice,
      mediaAvailable,
      mediaSeed,
      only3d,
      sampleOnly,
      threeDSeed,
    ],
  );
}
