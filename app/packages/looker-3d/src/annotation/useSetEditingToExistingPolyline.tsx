import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import { savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { getDefaultStore, useAtom, useSetAtom } from "jotai";
import { atomWithReset, useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  currentActiveAnnotationField3dAtom,
  currentArchetypeSelectedForTransformAtom,
  polylinePointTransformsAtom,
  selectedPolylineVertexAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";
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

  const setArchetypeSelectedForTransform = useSetRecoilState(
    currentArchetypeSelectedForTransformAtom
  );
  const setSelectedPoint = useSetRecoilState(selectedPolylineVertexAtom);
  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const jotaiStore = getDefaultStore();

  const syncWithSidebar = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      const { points3d: _points3d, _id, label: _label, ...rest } = label;

      jotaiStore.set(savedLabel, label);

      setPolylinePointTransforms((prev) => {
        return {
          ...prev,
          [label._id]: {
            ...(prev[label._id] ?? ({} as PolylinePointTransformData)),
            label: _label,
            misc: {
              ...sanitizeSchemaIoLabelAttributes(rest ?? {}),
            },
          },
        };
      });
    },
    []
  );

  const syncWithPolylinePointTransforms = useCallback(
    (label: fos.PolylineAnnotationLabel["data"]) => {
      setPolylinePointTransforms((prev) => {
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
      syncWithPolylinePointTransforms(label);

      const polylineLabelData = {
        _id: label._id,
        points: [],
        points3d: label.points3d || [],
        filled: label.filled,
        closed: label.closed,
        label: label.label || "",
        path: label["path"],
        sampleId: label["sampleId"],
      };

      setCurrentEditing({
        isNew: false,
        data: polylineLabelData,
        path: label.path,
        type: "Polyline" as const,
        overlay: {
          id: label._id,
          field: label.path,
          label: polylineLabelData,
          updateLabel: syncWithSidebar,
          getLabel: () => {
            return polylineLabelData;
          },
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setPolylinePointTransforms(null);
            }
          },
        },
      });

      setEditing(currentEditingExistingPolylineAtom);

      jotaiStore.set(savedLabel, polylineLabelData);
    },
    [syncWithSidebar, syncWithPolylinePointTransforms]
  );
};
