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
import { sanitizeSchemaIoLabelAttributes } from "./utils/polyline-utils";

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
  }, [resetCurrentEditing, resetEditing]);

  const syncWithSidebar = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      const { points3d: _points3d, _id, ...rest } = label;
      setPolylinePointTransforms((prev) => {
        return {
          ...prev,
          [label._id]: {
            ...(prev[label._id] ?? ({} as PolylinePointTransformData)),
            label: label.label,
            misc: {
              ...sanitizeSchemaIoLabelAttributes(rest ?? {}),
            },
          },
        };
      });
    },
    []
  );

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
          updateLabel: syncWithSidebar,
          getLabel: () => {
            return polylineLabelData;
          },
        },
      });

      setEditing(currentEditingPolylineAtom);
    },
    [
      currentSampleId,
      currentActiveField,
      shouldDefaultToClosed,
      syncWithSidebar,
    ]
  );
};
