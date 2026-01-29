import {
  groupMediaTypes,
  isGroup,
  preferredGroupAnnotationSliceAtom,
} from "@fiftyone/state";
import { is3d, isAnnotationSupported } from "@fiftyone/utilities";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";

export interface AnnotationSliceInfo {
  name: string;
  mediaType: string;
  isSupported: boolean;
  is3D: boolean;
}

/**
 * Hook that provides information about available slices for annotation
 * and manages the preferred annotation slice state.
 *
 * Returns:
 * - allSlices: All slices with metadata about their annotation support
 * - supportedSlices: Names of slices that support annotation (image, 3D)
 * - preferredSlice: The currently stored annotation slice (persisted per-dataset)
 * - setPreferredSlice: Function to update the preferred annotation slice
 */
export function useGroupAnnotationSlices() {
  const mediaTypes = useRecoilValue(groupMediaTypes);
  const isGroupDataset = useRecoilValue(isGroup);

  const [preferredSlice, setPreferredSlice] = useAtom(
    preferredGroupAnnotationSliceAtom
  );

  const sliceData = useMemo(() => {
    if (!isGroupDataset || !mediaTypes.length) {
      return {
        allSlices: [] as AnnotationSliceInfo[],
        supportedSlices: [] as string[],
      };
    }

    const allSlices: AnnotationSliceInfo[] = mediaTypes
      .map(({ name, mediaType }) => ({
        name,
        mediaType,
        isSupported: isAnnotationSupported(mediaType),
        is3D: is3d(mediaType),
      }))
      .toSorted((a, b) => {
        // Sink unsupported slices to the bottom
        if (a.isSupported !== b.isSupported) {
          return Number(b.isSupported) - Number(a.isSupported);
        }

        return 0;
      });

    const supportedSlices = allSlices
      .filter((s) => s.isSupported)
      .map((s) => s.name);

    return {
      allSlices,
      supportedSlices,
    };
  }, [mediaTypes, isGroupDataset]);

  return {
    ...sliceData,
    preferredSlice,
    setPreferredSlice,
  };
}
