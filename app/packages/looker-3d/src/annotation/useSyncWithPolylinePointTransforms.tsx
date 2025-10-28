import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { polylinePointTransformsAtom } from "../state";
import { PolylinePointTransformData } from "./types";

/**
 * Hook that provides a function to sync polyline label data with the polylinePointTransforms state
 */
export const useSyncWithPolylinePointTransforms = () => {
  const setPolylinePointTransforms = useSetRecoilState(
    polylinePointTransformsAtom
  );

  const syncWithPolylinePointTransforms = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      setPolylinePointTransforms((prev) => {
        if (!prev) {
          const { points3d: _points3d, _id, ...rest } = label;
          return {
            [label._id]: {
              segments: _points3d.map((segment) => ({
                points: segment.map((point) => [point[0], point[1], point[2]]),
              })),
              misc: {
                ...coerceStringBooleans(rest ?? {}),
              },
            },
          };
        }

        const { points3d: _points3d, _id, ...rest } = label;
        return {
          ...prev,
          [label._id]: {
            ...(prev[label._id] ?? ({} as PolylinePointTransformData)),
            segments: label.points3d.map((segment) => ({
              points: segment.map((point) => [point[0], point[1], point[2]]),
            })),
            label: label.label ?? "",
            misc: {
              ...coerceStringBooleans(rest ?? {}),
            },
          },
        };
      });
    },
    [setPolylinePointTransforms]
  );

  return syncWithPolylinePointTransforms;
};
