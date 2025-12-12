import {
  current,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import { useAtomValue, useSetAtom } from "jotai";
import { isEqual } from "lodash";
import { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { stagedCuboidTransformsAtom } from "../state";
import { quaternionToRadians, radiansToQuaternion } from "../utils";

/**
 * Hook that performs reverse sync - when staged cuboid transforms are changed (from the canvas),
 * it syncs the sidebar label's location/dimensions with data from the staging area
 */
export const useReverseSyncCuboidTransforms = () => {
  const currentAnnotation = useAtomValue(current);
  const setCurrentData = useSetAtom(current);
  const cuboidTransforms = useRecoilValue(stagedCuboidTransformsAtom);
  const setSavedLabel = useSetAtom(savedLabel);

  useEffect(() => {
    if (!currentAnnotation || currentAnnotation.type !== "Detection") {
      return;
    }

    const currentLabelId = currentAnnotation.data._id;

    if (!cuboidTransforms || !cuboidTransforms[currentLabelId]) {
      return;
    }

    const transformData = cuboidTransforms[currentLabelId];

    const newLocation = transformData.location;
    const newDimensions = transformData.dimensions;
    const newQuaternion = transformData.quaternion;

    const currentLocation = currentAnnotation.data.location;
    const currentDimensions = currentAnnotation.data.dimensions;
    const currentQuaternion = currentAnnotation.data.rotation
      ? radiansToQuaternion(currentAnnotation.data.rotation)
      : null;

    const hasLocationChanged = !isEqual(currentLocation, newLocation);
    const hasDimensionsChanged = !isEqual(currentDimensions, newDimensions);
    const isValidQuaternion =
      Array.isArray(newQuaternion) && newQuaternion.length === 4;
    const hasQuaternionChanged =
      !isEqual(currentQuaternion, newQuaternion) && isValidQuaternion;

    if (hasLocationChanged || hasDimensionsChanged || hasQuaternionChanged) {
      const updatedData = {
        ...currentAnnotation.data,
        ...(newLocation && { location: newLocation }),
        ...(newDimensions && { dimensions: newDimensions }),
        ...(newQuaternion && {
          rotation: quaternionToRadians(newQuaternion),
        }),
      };

      setCurrentData({
        ...currentAnnotation,
        data: updatedData,
        overlay: {
          ...currentAnnotation.overlay,
          label: updatedData,
        },
      });

      setSavedLabel({
        ...(newLocation && { location: newLocation }),
        ...(newDimensions && { dimensions: newDimensions }),
        ...(newQuaternion && {
          rotation: quaternionToRadians(newQuaternion),
        }),
      });
    }
  }, [cuboidTransforms, currentAnnotation]);
};
