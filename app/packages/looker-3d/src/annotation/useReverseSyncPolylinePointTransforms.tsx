import {
  current,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { stagedPolylineTransformsAtom } from "../state";

/**
 * Hook that performs reverse sync - when staged polyline coordinates are changed (from the canvas),
 * it syncs the sidebar label's points3d with coordinates from the staging area
 */
export const useReverseSyncPolylinePointTransforms = () => {
  const currentAnnotation = useAtomValue(current);
  const setCurrentData = useSetAtom(current);
  const polylinePointTransforms = useRecoilValue(stagedPolylineTransformsAtom);
  const setSavedLabel = useSetAtom(savedLabel);

  useEffect(() => {
    if (!currentAnnotation || currentAnnotation.type !== "Polyline") {
      return;
    }

    const currentLabelId = currentAnnotation.data._id;

    if (!polylinePointTransforms || !polylinePointTransforms[currentLabelId]) {
      return;
    }

    const transformData = polylinePointTransforms[currentLabelId];

    const newPoints3d = transformData.segments.map((segment) =>
      segment.points.map(
        (point) => [point[0], point[1], point[2]] as [number, number, number]
      )
    );

    const currentPoints3d = currentAnnotation.data.points3d;
    const hasChanged = !isEqual(currentPoints3d, newPoints3d);

    if (hasChanged) {
      setCurrentData({
        ...currentAnnotation,
        data: {
          ...currentAnnotation.data,
          points3d: newPoints3d,
        },
        overlay: {
          ...currentAnnotation.overlay,
          label: {
            ...currentAnnotation.overlay.label,
            points3d: newPoints3d,
          },
        },
      });
      setSavedLabel({
        points3d: newPoints3d,
      });
    }
  }, [polylinePointTransforms, currentAnnotation]);
};
