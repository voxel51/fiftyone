import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import * as fos from "@fiftyone/state";
import { useAtom, useSetAtom } from "jotai";
import { atomWithReset, useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import {
  currentActiveAnnotationField3dAtom,
  polylinePointTransformsAtom,
} from "../state";
import { sanitizeSchemaIoLabelAttributes } from "./utils/polyline-utils";

const currentEditingExistingPolylineAtom =
  atomWithReset<fos.AnnotationLabel | null>(null);

/**
 * Hook to set editing atom for existing polylines when clicked
 */
export const useSetEditingToExistingPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingExistingPolylineAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const [currentEditing, setCurrentEditing] = useAtom(
    currentEditingExistingPolylineAtom
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

  const syncToSidebar = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      const { points3d: _points3d, _id, ...rest } = label;

      setPolylinePointTransforms((prev) => {
        return {
          ...prev,
          [label._id]: {
            ...prev[label._id],
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
    (label: fos.PolylineAnnotationLabel["data"] & { path: string }) => {
      const polylineLabelData = {
        _id: label._id,
        points: [],
        points3d: label.points3d || [],
        filled: label.filled,
        closed: label.closed,
        label: label.label || "",
      };

      setCurrentEditing({
        isNew: false,
        data: polylineLabelData,
        path: label.path,
        type: "Polyline" as const,
        overlay: {
          id: label._id,
          updateLabel: syncToSidebar,
          getLabel: () => {
            return polylineLabelData;
          },
        },
      });

      setEditing(currentEditingExistingPolylineAtom);
    },
    [syncToSidebar]
  );
};
