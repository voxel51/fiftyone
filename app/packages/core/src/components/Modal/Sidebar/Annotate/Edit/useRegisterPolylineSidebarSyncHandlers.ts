import {
  PolylineOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import { useAnnotationContext } from "./state";
import { POLYLINE } from "@fiftyone/utilities";

/**
 * Registers event handlers to ensure polyline labels in lighter remain
 * synchronized with the annotation sidebar state.
 *
 * **Note: this hook must only be invoked in a single top-level component;
 * reuse will cause duplicate event handler registration.**
 */
export const useRegisterPolylineSidebarSyncHandlers = () => {
  const { scene } = useLighter();
  const { selectedLabel, updateSelectedLabelData } = useAnnotationContext();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const syncFromOverlay = useCallback(
    (payload: { id: string }) => {
      const overlay = selectedLabel?.overlay;
      if (
        !(overlay instanceof PolylineOverlay) ||
        payload.id !== overlay.id ||
        selectedLabel?.type !== POLYLINE
      ) {
        return;
      }

      updateSelectedLabelData({
        ...selectedLabel.data,
        points: overlay.getNestedPoints(),
        closed: overlay.getClosed(),
        filled: overlay.getFilled(),
      });
    },
    [selectedLabel, updateSelectedLabelData]
  );

  useEventHandler("lighter:keypoint-point-added", syncFromOverlay);
  useEventHandler("lighter:keypoint-point-moved", syncFromOverlay);
  useEventHandler("lighter:keypoint-point-deleted", syncFromOverlay);
};
