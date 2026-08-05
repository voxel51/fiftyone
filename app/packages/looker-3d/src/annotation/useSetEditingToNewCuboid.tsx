import { useAnnotationContext } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useAnnotationContext";
import * as fos from "@fiftyone/state";
import { type PrimitiveAtom, useSetAtom } from "jotai";
import { atomWithReset, useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  currentActiveAnnotationField3dAtom,
} from "../state";
import { quaternionToRadians } from "../utils";
import type { CuboidTransformData } from "./types";

export const currentEditingCuboidAtom =
  atomWithReset<fos.AnnotationLabel | null>(null);

/**
 * Hook to set editing atom for new cuboids
 */
export const useSetEditingToNewCuboid = () => {
  const resetCurrentEditing = useResetAtom(currentEditingCuboidAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);

  const setCurrentEditing = useSetAtom(currentEditingCuboidAtom);
  const { clear, readEditing, select } = useAnnotationContext();

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      clear();
    };
  }, [resetCurrentEditing, clear]);

  return useCallback(
    (labelId: string, transformData: CuboidTransformData, labelClass = "") => {
      if (!transformData.location || !transformData.dimensions) return;

      // If what we already have in sidebar is same as the new label, don't do anything
      // Because it'll be handled by reverse sync
      if (readEditing().selected?.label.data._id === labelId) {
        return;
      }

      // Needs a reset...otherwise sometimes gets contaminated by the previous label
      clear();

      const rotation: [number, number, number] = transformData.quaternion
        ? quaternionToRadians(transformData.quaternion)
        : [0, 0, 0];

      // Label data is the persistable document ONLY — addressing (path,
      // sampleId) rides on the AnnotationLabel wrapper, never inside `data`,
      // so a draft's first save cannot leak it into the sample.
      const defaultCuboidLabelData = {
        _id: labelId,
        _cls: "Detection" as const,
        location: transformData.location,
        dimensions: transformData.dimensions,
        rotation,
        label: labelClass,
      };

      const stagedCuboidLabelData = {
        ...defaultCuboidLabelData,
      };

      // The 3D cuboid overlay structure differs from the 2D DetectionOverlay
      // class — the 3D annotation system uses a simpler object-based overlay
      // pattern similar to polylines — so the cast goes through unknown.
      setCurrentEditing({
        isNew: true,
        data: stagedCuboidLabelData,
        path: currentActiveField,
        type: "Detection" as const,
        overlay: {
          id: labelId,
          getLabel: () => {
            return stagedCuboidLabelData;
          },
          field: currentActiveField,
          label: stagedCuboidLabelData,
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
            }
          },
        },
      } as unknown as fos.AnnotationLabel);

      // setCurrentEditing above populated the cuboid atom; select() snapshots
      // its data into savedLabel — the prior explicit set(savedLabel, ...) is
      // redundant since defaultCuboidLabelData and stagedCuboidLabelData are
      // structurally equal.
      select(
        currentEditingCuboidAtom as unknown as PrimitiveAtom<fos.AnnotationLabel>,
      );
    },
    [
      clear,
      clearTransformState,
      currentActiveField,
      readEditing,
      select,
      setCurrentEditing,
    ],
  );
};
