import {
  AnnotationEventGroup,
  useAnnotationEventHandler,
} from "@fiftyone/annotation";
import {
  coerceStringBooleans,
  useLabelsContext,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate";
import { useCallback } from "react";
import { useRecoilCallback, useSetRecoilState } from "recoil";
import {
  useCuboidOperations,
  usePolylineOperations,
  workingAtom,
} from "../annotation/store";
import { hoveredLabelAtom } from "../state";
import { isDetection, isPolyline } from "../types";
import { useSelect3DLabelForAnnotation } from "./useSelect3DLabelForAnnotation";

/**
 * Hook that registers event handlers for 3D annotation sidebar events.
 */
export const use3dAnnotationEventHandlers = () => {
  const { updateCuboid } = useCuboidOperations();
  const { updatePolyline } = usePolylineOperations();
  const setHoveredLabel = useSetRecoilState(hoveredLabelAtom);
  const select3DLabelForAnnotation = useSelect3DLabelForAnnotation();
  const { updateLabelData } = useLabelsContext();

  const handleSidebarLabelSelected = useCallback(
    (payload) => {
      select3DLabelForAnnotation(payload.data);
    },
    [select3DLabelForAnnotation]
  );

  const handleSidebarValueUpdated = useRecoilCallback(
    ({ snapshot }) =>
      async (payload: { value: Record<string, unknown> }) => {
        const { _id, ...updates } = payload.value;

        if (typeof _id !== "string") return;

        const working = await snapshot.getPromise(workingAtom);
        const existingLabel = working.doc.labelsById[_id];

        if (!existingLabel) return;

        if (isDetection(existingLabel)) {
          updateCuboid(_id, coerceStringBooleans(updates));
        } else if (isPolyline(existingLabel)) {
          updatePolyline(_id, coerceStringBooleans(updates));
        }
      },
    [updateCuboid, updatePolyline]
  );

  const handleSidebarLabelHover = useCallback(
    (payload) => {
      setHoveredLabel({
        id: payload.id,
      });
    },
    [setHoveredLabel]
  );

  const handleSidebarLabelUnhover = useCallback(() => {
    setHoveredLabel(null);
  }, [setHoveredLabel]);

  useAnnotationEventHandler(
    "annotation:sidebarLabelSelected",
    handleSidebarLabelSelected
  );
  useAnnotationEventHandler(
    "annotation:sidebarValueUpdated",
    handleSidebarValueUpdated
  );
  useAnnotationEventHandler(
    "annotation:sidebarLabelHover",
    handleSidebarLabelHover
  );
  useAnnotationEventHandler(
    "annotation:sidebarLabelUnhover",
    handleSidebarLabelUnhover
  );

  const handleLabelEdit = useCallback(
    (
      payload:
        | AnnotationEventGroup["annotation:labelEdit"]
        | AnnotationEventGroup["annotation:undoLabelEdit"]
    ) => {
      updateLabelData(payload.label.id, payload.label);
    },
    [updateLabelData]
  );

  useAnnotationEventHandler("annotation:labelEdit", handleLabelEdit);
  useAnnotationEventHandler("annotation:undoLabelEdit", handleLabelEdit);
};
