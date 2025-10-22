import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import * as fos from "@fiftyone/state";
import { atom, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilValue } from "recoil";
import {
  currentActiveAnnotationField3dAtom,
  snapCloseAutomaticallyAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";

/**
 *
 */
export const useSetEditingToNewPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const shouldDefaultToClosed = useRecoilValue(snapCloseAutomaticallyAtom);

  useEffect(() => {
    return () => {
      resetEditing();
    };
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
        label: "",
      };

      setEditing(
        atom({
          isNew: true,
          data: polylineLabelData,
          path: transformData.path || currentActiveField,
          type: "Polyline" as const,
          overlay: { id: labelId },
        })
      );
    },
    [currentSampleId, currentActiveField, shouldDefaultToClosed, setEditing]
  );
};
