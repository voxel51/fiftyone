import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import {
  useCuboidOperations,
  usePolylineOperations,
  useUpdateWorkingLabel,
} from "../annotation/store";
import { hoveredLabelAtom, selectedLabelForAnnotationAtom } from "../state";
import { isDetectionOverlay, isPolylineOverlay } from "../types";

/**
 * Hook that registers event handlers for 3D annotation sidebar events.
 */
export const use3dAnnotationEventHandlers = () => {
  const updateWorkingLabel = useUpdateWorkingLabel();
  const { updateCuboid } = useCuboidOperations();
  const { updatePolyline } = usePolylineOperations();
  const setSelectedLabelForAnnotation = useSetRecoilState(
    selectedLabelForAnnotationAtom
  );
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);

  useAnnotationEventHandler(
    "annotation:sidebarLabelSelected",
    useCallback((payload) => {
      setSelectedLabelForAnnotation({
        _id: payload.id,
        ...payload.data,
      });
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    useCallback(
      (payload) => {
        const { _id, ...updates } = payload.value;

        if (isDetectionOverlay(updates)) {
          updateCuboid(_id, coerceStringBooleans(updates));
        } else if (isPolylineOverlay(updates)) {
          updatePolyline(_id, coerceStringBooleans(updates));
        } else {
          // Fallback for other types (non-undoable)
          updateWorkingLabel(_id, coerceStringBooleans(updates));
        }
      },
      [updateCuboid, updatePolyline, updateWorkingLabel]
    )
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    useCallback((payload) => {
      setHoveredLabel({
        id: payload.id,
      });
    }, [])
  );

  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    useCallback(() => {
      setHoveredLabel(null);
    }, [])
  );
};
