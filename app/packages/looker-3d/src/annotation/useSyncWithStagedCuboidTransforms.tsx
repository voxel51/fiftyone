import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import { stagedCuboidTransformsAtom } from "../state";
import { radiansToQuaternion } from "../utils";

/**
 * Hook that provides a function to sync cuboid label data with the
 * stagedCuboidTransforms state.
 */
export const useSyncWithStagedCuboidTransforms = () => {
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );

  const syncWithStagedCuboidTransforms = useCallback(
    (label: fos.DetectionAnnotationLabel["data"]) => {
      const { _id, location, dimensions, rotation } = label;

      const quaternion = rotation ? radiansToQuaternion(rotation) : null;

      setStagedCuboidTransforms((prev) => {
        const transformData = {
          location: location as Vector3Tuple,
          dimensions: dimensions as Vector3Tuple,
          quaternion,
          rotation,
        };

        if (!prev) {
          return {
            [_id]: transformData,
          };
        }

        return {
          [_id]: {
            ...transformData,
            ...(prev[_id] ?? {}),
          },
        };
      });
    },
    [setStagedCuboidTransforms]
  );

  return syncWithStagedCuboidTransforms;
};
