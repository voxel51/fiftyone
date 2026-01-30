import * as fos from "@fiftyone/state";
import { is3d } from "@fiftyone/utilities";
import { useCallback } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";

/**
 * Hook that provides a function to apply the appropriate visibility settings
 * for a given annotation slice.
 *
 * For 3D slices: shows 3D viewer, hides 2D viewer / carousel, pins the 3D slice
 * For other slices: shows 2D viewer, hides 3D/carousel, unpins 3D
 */
export function useApplyAnnotationSliceVisibility() {
  const groupMediaTypesMap = useRecoilValue(fos.groupMediaTypesMap);
  const set3dVisible = useSetRecoilState(fos.groupMedia3dVisibleSetting);
  const setMainVisible = useSetRecoilState(
    fos.groupMediaIsMain2DViewerVisibleSetting
  );
  const setCarouselVisible = useSetRecoilState(
    fos.groupMediaIsCarouselVisibleSetting
  );
  const setIs3dSlicePinned = useSetRecoilState(fos.pinned3d);
  const setPinned3DSampleSliceName = useSetRecoilState(fos.pinned3DSampleSlice);
  const setAllActive3dSlices = useSetRecoilState(fos.active3dSlices);

  return useCallback(
    (sliceName: string) => {
      const mediaType = groupMediaTypesMap[sliceName];
      const isThreeD = mediaType ? is3d(mediaType) : false;

      if (isThreeD) {
        set3dVisible(true);
        setMainVisible(false);
        setCarouselVisible(false);

        setIs3dSlicePinned(true);
        setPinned3DSampleSliceName(sliceName);
        setAllActive3dSlices((prev) =>
          Array.from(new Set([sliceName, ...prev]))
        );
      } else {
        setMainVisible(true);
        set3dVisible(false);
        setCarouselVisible(false);
        // Unpin 3D so activeModalSample returns modalSample data
        setIs3dSlicePinned(false);
      }
    },
    [groupMediaTypesMap]
  );
}
