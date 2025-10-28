import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
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
  polylinePointTransformsAtom,
  snapCloseAutomaticallyAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";

export const currentEditingPolylineAtom =
  atomWithReset<fos.AnnotationLabel | null>(null);

/**
 * Hook to set editing atom for new polylines
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

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, [resetCurrentEditing, resetEditing]);

  const jotaiStore = getDefaultStore();

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
              ...coerceStringBooleans(rest ?? {}),
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

      // Needs a reset...otherwise gets contaminated by the previous label
      setEditing(null);

      // Only process transforms for the current sample
      if (transformData.sampleId !== currentSampleId) return;

      // Array index IS the segmentIndex
      const effectivePoints: [number, number, number][][] =
        transformData.segments.map((segment) => segment.points);

      const polylineLabelData = {
        _id: labelId,
        _cls: "Polyline",
        points: [],
        points3d: effectivePoints,
        filled: false,
        closed: shouldDefaultToClosed,
        label: transformData.label,
        path: transformData.path,
        sampleId: transformData.sampleId,
        ...(transformData.misc ?? {}),
      };

      setCurrentEditing({
        isNew: true,
        data: polylineLabelData,
        path: polylineLabelData.path,
        type: "Polyline" as const,
        overlay: {
          id: labelId,
          updateLabel: syncWithSidebar,
          getLabel: () => {
            return polylineLabelData;
          },
          field: polylineLabelData.path,
          label: polylineLabelData,
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setPolylinePointTransforms(null);
            }
          },
        },
      });

      setEditing(currentEditingPolylineAtom);

      jotaiStore.set(savedLabel, {});
    },
    [
      currentSampleId,
      currentActiveField,
      shouldDefaultToClosed,
      syncWithSidebar,
    ]
  );
};
