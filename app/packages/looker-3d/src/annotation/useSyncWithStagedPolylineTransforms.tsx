import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { stagedPolylineTransformsAtom } from "../state";
import { PolylinePointTransformData } from "./types";
import { points3dToPolylineSegments } from "./utils/polyline-utils";

/**
 * Hook that provides a function to sync polyline label data with the
 * stagedPolylineTransforms state.
 */
export const useSyncWithStagedPolylineTransforms = () => {
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );

  const syncWithStagedPolylineTransforms = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      const { points3d, _id, label: labelName, ...rest } = label;

      setStagedPolylineTransforms((prev) => {
        if (!prev) {
          return {
            [_id]: {
              segments: points3dToPolylineSegments(points3d),
              label: labelName ?? "",
              misc: {
                ...coerceStringBooleans(rest ?? {}),
              },
            },
          };
        }

        return {
          ...prev,
          [_id]: {
            segments: points3dToPolylineSegments(points3d),
            label: labelName ?? "",
            misc: {
              ...coerceStringBooleans(rest ?? {}),
            },
            ...(prev[_id] ?? ({} as PolylinePointTransformData)),
          },
        };
      });
    },
    [setStagedPolylineTransforms]
  );

  return syncWithStagedPolylineTransforms;
};
