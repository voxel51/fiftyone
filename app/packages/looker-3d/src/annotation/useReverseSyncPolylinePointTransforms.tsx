import {
  current,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { polylinePointTransformsAtom } from "../state";

/**
 * Hook that performs reverse sync - when polylinePointTransformsAtom changes,
 * it syncs the current annotation's points3d with coordinates from the transform data
 */
export const useReverseSyncPolylinePointTransforms = () => {
  const currentAnnotation = useAtomValue(current);
  const setCurrentData = useSetAtom(current);
  const polylinePointTransforms = useRecoilValue(polylinePointTransformsAtom);
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
    const hasChanged =
      !currentPoints3d ||
      currentPoints3d.length !== newPoints3d.length ||
      currentPoints3d.some(
        (segment, segmentIndex) =>
          !newPoints3d[segmentIndex] ||
          segment.length !== newPoints3d[segmentIndex].length ||
          segment.some(
            (point, pointIndex) =>
              !newPoints3d[segmentIndex][pointIndex] ||
              point[0] !== newPoints3d[segmentIndex][pointIndex][0] ||
              point[1] !== newPoints3d[segmentIndex][pointIndex][1] ||
              point[2] !== newPoints3d[segmentIndex][pointIndex][2]
          )
      );

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
  }, [polylinePointTransforms, currentAnnotation, setCurrentData]);
};
