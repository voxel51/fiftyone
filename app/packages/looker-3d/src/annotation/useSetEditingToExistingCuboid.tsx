import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import { savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { getDefaultStore, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import {
  clearTransformStateSelector,
  stagedCuboidTransformsAtom,
} from "../state";
import { currentEditingCuboidAtom } from "./useSetEditingToNewCuboid";
import { useSyncWithStagedCuboidTransforms } from "./useSyncWithStagedCuboidTransforms";

/**
 * This hook returns a function, which when called, achieves two things
 * when an existing cuboid is clicked on the canvas:
 * 1. It sets the editing atom for the existing cuboid
 * 2. It adds the cuboid to the "staging" area
 */
export const useSetEditingToExistingCuboid = () => {
  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingCuboidAtom);
  const setCurrentEditing = useSetAtom(currentEditingCuboidAtom);
  const setStagedCuboidTransforms = useSetRecoilState(
    stagedCuboidTransformsAtom
  );
  const syncWithStagedCuboidTransforms = useSyncWithStagedCuboidTransforms();

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, [resetCurrentEditing, resetEditing]);

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const jotaiStore = getDefaultStore();

  return useCallback(
    (label: fos.Detection3DAnnotationLabel["data"]) => {
      // This cuboid may be manipulated now from the canvas,
      // which is why we add it to "staging"
      syncWithStagedCuboidTransforms(label);

      // This takes care of the sidebar
      setCurrentEditing({
        isNew: false,
        data: label,
        path: label.path,
        type: "Detection" as const,
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
              setStagedCuboidTransforms({});
            }
          },
        },
      });

      setEditing(currentEditingCuboidAtom);

      jotaiStore.set(savedLabel, label);
    },
    [syncWithStagedCuboidTransforms]
  );
};
