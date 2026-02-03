import { editing as editingAtom } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit";
import { savedLabel } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/state";
import * as fos from "@fiftyone/state";
import { DETECTION, POLYLINE } from "@fiftyone/utilities";
import { getDefaultStore, useSetAtom } from "jotai";
import { useResetAtom } from "jotai/utils";
import { useCallback, useEffect } from "react";
import { useSetRecoilState } from "recoil";
import { ANNOTATION_CUBOID, ANNOTATION_POLYLINE } from "../constants";
import { clearTransformStateSelector } from "../state";
import { isDetectionOverlay, isPolylineOverlay } from "../types";
import { useWorkingDoc } from "./store";
import { currentEditingCuboidAtom } from "./useSetEditingToNewCuboid";
import { currentEditingPolylineAtom } from "./useSetEditingToNewPolyline";

type AnnotationType = typeof ANNOTATION_CUBOID | typeof ANNOTATION_POLYLINE;

type CuboidLabelData = fos.Detection3DAnnotationLabel["data"];
type PolylineLabelData = fos.PolylineAnnotationLabel["data"];

/**
 * This hook returns a function, which when called, sets the editing atom for the existing 3D label
 * so that it is available in the sidebar.
 *
 * @param type - The type of 3D annotation ("cuboid" or "polyline")
 */
export function useSetEditingToExisting3dLabel(
  type: typeof ANNOTATION_CUBOID
): (label: CuboidLabelData) => void;
export function useSetEditingToExisting3dLabel(
  type: typeof ANNOTATION_POLYLINE
): (label: PolylineLabelData) => void;
export function useSetEditingToExisting3dLabel(type: AnnotationType) {
  const isCuboid = type === ANNOTATION_CUBOID;

  const currentEditingAtom = isCuboid
    ? currentEditingCuboidAtom
    : currentEditingPolylineAtom;
  const labelType = isCuboid ? DETECTION : POLYLINE;

  const setEditing = useSetAtom(editingAtom);
  const resetEditing = useResetAtom(editingAtom);
  const resetCurrentEditing = useResetAtom(currentEditingAtom);
  const setCurrentEditing = useSetAtom(currentEditingAtom);
  const workingDoc = useWorkingDoc();

  useEffect(() => {
    return () => {
      resetCurrentEditing();
      resetEditing();
    };
  }, [resetCurrentEditing, resetEditing]);

  const clearTransformState = useSetRecoilState(clearTransformStateSelector);

  const jotaiStore = getDefaultStore();

  return useCallback(
    (label: CuboidLabelData | PolylineLabelData) => {
      // Check if we have this label in the working store already
      const workingLabel = workingDoc.labelsById[label._id];

      // Use working store data if available, otherwise fall back to the label from overlay
      let effectiveLabel = label;

      if (isCuboid && isDetectionOverlay(workingLabel)) {
        effectiveLabel = {
          ...label,
          location: workingLabel.location,
          dimensions: workingLabel.dimensions,
          rotation: workingLabel.rotation,
        };
      } else if (!isCuboid && isPolylineOverlay(workingLabel)) {
        effectiveLabel = {
          ...label,
          points3d: workingLabel.points3d,
        };
      }

      // This takes care of the sidebar
      setCurrentEditing({
        isNew: false,
        data: effectiveLabel,
        path: effectiveLabel.path,
        type: labelType,
        overlay: {
          id: effectiveLabel._id,
          field: effectiveLabel.path,
          label: effectiveLabel,
          getLabel: () => {
            return { ...effectiveLabel };
          },
          setSelected: (selected: boolean) => {
            if (!selected) {
              clearTransformState({});
            }
          },
        },
      } as fos.AnnotationLabel);

      setEditing(currentEditingAtom as any);

      jotaiStore.set(savedLabel, effectiveLabel);
    },
    [workingDoc]
  );
}
