import { useAnnotationEventHandler } from "@fiftyone/annotation";
import { coerceStringBooleans } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { useUpdateWorkingLabel } from "../annotation/store";
import { hoveredLabelAtom, selectedLabelForAnnotationAtom } from "../state";
import { isDetection3dOverlay, isPolyline3dOverlay } from "../types";

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
        // Use currentLabel to determine label type since payload.value is partial
        // and may not include geometry fields for metadata-only updates
        const { currentLabel, value } = payload;
        if (
          !isPolyline3dOverlay(currentLabel) &&
          !isDetection3dOverlay(currentLabel)
        ) {
          return;
        }

        const { _id, ...updates } = value;
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
