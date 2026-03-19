import * as fos from "@fiftyone/state";
import { is3d } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef } from "react";
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

  // Creating a ref to above so that we keep returned callback referentially stable
  // and having imperative access to this map is fine
  const groupMediaTypesMapRef = useRef(groupMediaTypesMap);
  groupMediaTypesMapRef.current = groupMediaTypesMap;

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

  return useCallback((sliceName: string) => {
    const mediaType = groupMediaTypesMapRef.current[sliceName];
    const isThreeD = mediaType ? is3d(mediaType) : false;

    if (isThreeD) {
      set3dVisible(true);
      setMainVisible(false);
      setCarouselVisible(false);

      setIs3dSlicePinned(true);
      setPinned3DSampleSliceName(sliceName);
      setAllActive3dSlices((prev) => Array.from(new Set([sliceName, ...prev])));
    } else {
      setMainVisible(true);
      set3dVisible(false);
      setCarouselVisible(false);
      // Unpin 3D so activeModalSample returns modalSample data
      setIs3dSlicePinned(false);
    }
  }, []);
}
