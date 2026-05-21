import { currentGroupSliceNames, groupMediaTypes } from "@fiftyone/state";
import { is3d, isAnnotationSupported } from "@fiftyone/utilities";
import { useMemo } from "react";
import {
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";

export interface AnnotationSliceInfo {
  /** Slice name. */
  name: string;
  /** Raw media type string (e.g. "image", "point-cloud"). */
  mediaType: string;
  /** Whether this slice's media type can be annotated. */
  isSupported: boolean;
  /** Whether this slice's media type is a 3D type. */
  is3D: boolean;

  /** Whether this slice is absent from the currently open group (sparse dataset). */
  isMissing: boolean;
}

export const resolveSlices = (
  currentSlices: string[],
  sliceInfo: { name: string; mediaType: string }[]
): AnnotationSliceInfo[] => {
  return sliceInfo
    .map(({ name, mediaType }) => ({
      name,
      mediaType,
      isMissing: !currentSlices.includes(name),
      isSupported: isAnnotationSupported(mediaType),
      is3D: is3d(mediaType),
    }))
    .toSorted((a, b) => {
      if (a.isSupported !== b.isSupported) {
        return Number(b.isSupported) - Number(a.isSupported);
      }

      return 0;
    });
};

export function useGroupAnnotationSlices(): {
  resolved: AnnotationSliceInfo[] | "loading";
  request: () => Promise<AnnotationSliceInfo[]>;
} {
  const currentSlices = useRecoilValueLoadable(currentGroupSliceNames);
  const sliceInfo = useRecoilValue(groupMediaTypes);

  const resolved = useMemo(() => {
    if (currentSlices.state === "loading") {
      return "loading";
    }

    if (currentSlices.state === "hasError") {
      throw currentSlices.contents;
    }

    if (!sliceInfo.length) {
      return [];
    }

    return resolveSlices(currentSlices.contents, sliceInfo);
  }, [currentSlices, sliceInfo]);

  return {
    resolved,
    request: useRecoilCallback(
      ({ snapshot }) =>
        async () => {
          const slices = await snapshot.getPromise(currentGroupSliceNames);
          return resolveSlices(slices, sliceInfo);
        },
      [sliceInfo]
    ),
  };
}
