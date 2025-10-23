import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import * as fos from "@fiftyone/state";
import { useAtom, useSetAtom } from "jotai";
import { atomWithReset, useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  currentActiveAnnotationField3dAtom,
  polylinePointTransformsAtom,
  snapCloseAutomaticallyAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";

const currentEditingPolylineAtom = atomWithReset<fos.AnnotationLabel | null>(
  null
);

/**
 *
 */
export const useSetEditingToNewPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingPolylineAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const shouldDefaultToClosed = useRecoilValue(snapCloseAutomaticallyAtom);
  const [currentEditing, setCurrentEditing] = useAtom(
    currentEditingPolylineAtom
  );
  const [polylinePointTransforms, setPolylinePointTransforms] = useRecoilState(
    polylinePointTransformsAtom
  );

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, []);

  const syncToSidebar = useCallback((label: fos.AnnotationLabel["data"]) => {
    // Note: we only sync label: string for now
    setPolylinePointTransforms((prev) => {
      return {
        ...prev,
        [label._id]: {
          ...prev[label._id],
          label: label.label,
        },
      };
    });
  }, []);

  return useCallback(
    (labelId: string, transformData: PolylinePointTransformData) => {
      if (!transformData.segments || transformData.segments.length === 0)
        return;

      // Only process transforms for the current sample
      if (transformData.sampleId !== currentSampleId) return;

      // Array index IS the segmentIndex
      const effectivePoints: [number, number, number][][] =
        transformData.segments.map((segment) => segment.points);

      const polylineLabelData = {
        _id: labelId,
        points: [],
        points3d: effectivePoints,
        filled: false,
        closed: shouldDefaultToClosed,
        label: transformData.label,
      };

      setCurrentEditing({
        isNew: true,
        data: polylineLabelData,
        path: transformData.path || currentActiveField,
        type: "Polyline" as const,
        overlay: {
          id: labelId,
          updateLabel: syncToSidebar,
          getLabel: () => {
            return polylineLabelData;
          },
        },
      });

      setEditing(currentEditingPolylineAtom);
    },
    [currentSampleId, currentActiveField, shouldDefaultToClosed]
  );
};
