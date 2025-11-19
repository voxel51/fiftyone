import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import { savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { getDefaultStore, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  stagedPolylineTransformsAtom,
} from "../state";
import { currentEditingPolylineAtom } from "./useSetEditingToNewPolyline";
import { useSyncWithStagedPolylineTransforms } from "./useSyncWithStagedPolylineTransforms";

/**
 * This hook returns a function, which when called, achieves two things
 * when an existing polyline is clicked on the canvas:
 * 1. It sets the editing atom for the existing polyline
 * 2. It adds the polyline to the "staging" area
 */
export const useSetEditingToExistingPolyline = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingPolylineAtom);
  const setCurrentEditing = useSetAtom(currentEditingPolylineAtom);
  const setStagedPolylineTransforms = useSetRecoilState(
    stagedPolylineTransformsAtom
  );
  const syncWithStagedPolylineTransforms =
    useSyncWithStagedPolylineTransforms();

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, [resetCurrentEditing, resetEditing]);

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const jotaiStore = getDefaultStore();

  return useCallback(
    (label: fos.PolylineAnnotationLabel["data"] & { path: string }) => {
      // This polyline may be manipulated now from the canvas,
      // which is why we add it to "staging"
      syncWithStagedPolylineTransforms(label);

      // This takes care of the sidebar
      setCurrentEditing({
        isNew: false,
        data: label,
        path: label.path,
        type: "Polyline" as const,
        overlay: {
          id: label._id,
          field: label.path,
          label: label,
          getLabel: () => {
            return { ...label };
          },
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
              setStagedPolylineTransforms({});
            }
          },
        },
      });

      setEditing(currentEditingPolylineAtom);

      jotaiStore.set(savedLabel, label);
    },
    [syncWithStagedPolylineTransforms]
  );
};
