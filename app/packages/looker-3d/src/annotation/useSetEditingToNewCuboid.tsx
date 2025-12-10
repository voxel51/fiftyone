import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import {
  current,
  savedLabel,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { atomWithReset, useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import type { Vector3Tuple } from "three";
import {
  clearTransformStateSelector,
  currentActiveAnnotationField3dAtom,
  stagedCuboidTransformsAtom,
} from "../state";

export interface CuboidTransformData {
  location: Vector3Tuple;
  dimensions: Vector3Tuple;
  quaternion?: [number, number, number, number];
}

export const currentEditingCuboidAtom =
  atomWithReset<fos.AnnotationLabel | null>(null);

/**
 * Hook to set editing atom for new cuboids
 */
export const useSetEditingToNewCuboid = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingCuboidAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);

  const setCurrentEditing = useSetAtom(currentEditingCuboidAtom);
  const currentAnnotationSidebar = useAtomValue(current);
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      setEditing(null);
    };
  }, [resetCurrentEditing]);

  const jotaiStore = getDefaultStore();

  return useCallback(
    (labelId: string, transformData: CuboidTransformData) => {
      if (!transformData.location || !transformData.dimensions) return;

      // If what we already have in sidebar is same as the new label, don't do anything
      // Because it'll be handled by reverse sync
      if (currentAnnotationSidebar?.data._id === labelId) {
        return;
      }

      // Needs a reset...otherwise sometimes gets contaminated by the previous label
      setEditing(null);

      const rotation: [number, number, number] = transformData.quaternion
        ? quaternionToRotation(transformData.quaternion)
        : [0, 0, 0];

      const defaultCuboidLabelData = {
        _id: labelId,
        _cls: "Detection" as const,
        location: transformData.location,
        dimensions: transformData.dimensions,
        rotation,
        label: "",
        path: currentActiveField,
        sampleId: currentSampleId,
      };

      const stagedCuboidLabelData = {
        ...defaultCuboidLabelData,
      };

      // Note: We use 'as any' here because the 3D cuboid overlay structure differs
      // from the 2D BoundingBoxOverlay class. The 3D annotation system uses a simpler
      // object-based overlay pattern similar to polylines.
      setCurrentEditing({
        isNew: true,
        data: stagedCuboidLabelData,
        path: stagedCuboidLabelData.path,
        type: "Detection" as const,
        overlay: {
          id: labelId,
          getLabel: () => {
            return stagedCuboidLabelData;
          },
          field: stagedCuboidLabelData.path,
          label: stagedCuboidLabelData,
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setStagedCuboidTransforms({});
            }
          },
        },
      } as any);

      setEditing(currentEditingCuboidAtom as any);

      (jotaiStore as any).set(savedLabel, defaultCuboidLabelData);
    },
    [currentSampleId, currentActiveField, currentAnnotationSidebar]
  );
};

/**
 * Convert quaternion [x, y, z, w] to Euler rotation [x, y, z] in radians
 */
function quaternionToRotation(
  quaternion: [number, number, number, number]
): [number, number, number] {
  const [x, y, z, w] = quaternion;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (w * y - z * x);
  let pitch: number;
  if (Math.abs(sinp) >= 1) {
    pitch = (Math.PI / 2) * Math.sign(sinp); // use 90 degrees if out of range
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return [roll, pitch, yaw];
}
