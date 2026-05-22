import {
  PolylineOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventHandler,
} from "@fiftyone/lighter";
import { useCallback } from "react";
import { useAnnotationContext } from "./useAnnotationContext";
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
  const { selected, setData } = useAnnotationContext();

  const useEventHandler = useLighterEventHandler(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const syncFromOverlay = useCallback(
    (payload: { id: string }) => {
      const overlay = selected.label?.overlay;
      if (
        !(overlay instanceof PolylineOverlay) ||
        payload.id !== overlay.id ||
        selected.label?.type !== POLYLINE
      ) {
        return;
      }

      setData({
        ...selected.label.data,
        points: overlay.getNestedPoints(),
        closed: overlay.getClosed(),
        filled: overlay.getFilled(),
      });
    },
    [selected.label, setData]
  );

  useEventHandler("lighter:keypoint-point-added", syncFromOverlay);
  useEventHandler("lighter:keypoint-point-moved", syncFromOverlay);
  useEventHandler("lighter:keypoint-point-deleted", syncFromOverlay);
};
