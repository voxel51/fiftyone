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
import {
  clearTransformStateSelector,
  currentActiveAnnotationField3dAtom,
  snapCloseAutomaticallyAtom,
  stagedPolylineTransformsAtom,
} from "../state";
import { PolylinePointTransformData } from "./types";

export const currentEditingPolylineAtom =
  atomWithReset<fos.AnnotationLabel | null>(null);

/**
 * Hook to set editing atom for new polylines
 */
export const useSetEditingToNewPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingPolylineAtom);
  const currentActiveField = useRecoilValue(currentActiveAnnotationField3dAtom);
  const currentSampleId = useRecoilValue(fos.currentSampleId);
  const shouldDefaultToClosed = useRecoilValue(snapCloseAutomaticallyAtom);

  const setCurrentEditing = useSetAtom(currentEditingPolylineAtom);
  const currentAnnotationSidebar = useAtomValue(current);
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
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
    (labelId: string, transformData: PolylinePointTransformData) => {
      if (!transformData.segments || transformData.segments.length === 0)
        return;

      // If what we already have in sidebar is same as the new label, don't do anything
      // Because it'll be handled by reverse sync and useSetEditingToExistingPolyline
      if (currentAnnotationSidebar?.data._id === labelId) {
        return;
      }

      // Needs a reset...otherwise sometimes gets contaminated by the previous label
      setEditing(null);

      // Only process transforms for the current sample
      if (transformData.sampleId !== currentSampleId) return;

      // Array index IS the segmentIndex
      const effectivePoints: [number, number, number][][] =
        transformData.segments.map((segment) => segment.points);

      const defaultPolylineLabelData = {
        _id: labelId,
        _cls: "Polyline",
        points: [],
        points3d: null,
        filled: false,
        closed: shouldDefaultToClosed,
        label: transformData.label,
        path: transformData.path ?? currentActiveField,
        sampleId: transformData.sampleId ?? currentSampleId,
        ...(transformData.misc ?? {}),
      };

      const stagedPolylineLabelData = {
        ...defaultPolylineLabelData,
        points3d: effectivePoints,
      };

      setCurrentEditing({
        isNew: true,
        data: stagedPolylineLabelData,
        path: stagedPolylineLabelData.path,
        type: "Polyline" as const,
        overlay: {
          id: labelId,
          getLabel: () => {
            return stagedPolylineLabelData;
          },
          field: stagedPolylineLabelData.path,
          label: stagedPolylineLabelData,
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setStagedPolylineTransforms({});
            }
          },
        },
      });

      setEditing(currentEditingPolylineAtom);

      jotaiStore.set(savedLabel, defaultPolylineLabelData);
    },
    [
      currentSampleId,
      currentActiveField,
      shouldDefaultToClosed,
      currentAnnotationSidebar,
    ]
  );
};
