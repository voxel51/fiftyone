import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { useUpdateWorkingLabel } from "../annotation/store";
import { hoveredLabelAtom, selectedLabelForAnnotationAtom } from "../state";
import { isDetectionOverlay, isPolylineOverlay } from "../types";

/**
 * Hook that registers event handlers for 3D annotation sidebar events.
 */
export const use3dAnnotationEventHandlers = () => {
  const updateWorkingLabel = useUpdateWorkingLabel();
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
        if (!isPolylineOverlay(updates) && !isDetectionOverlay(updates)) {
          return;
        }

        updateWorkingLabel(_id, coerceStringBooleans(updates));
      },
      [updateWorkingLabel]
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
