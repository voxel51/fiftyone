import { useAnnotationContextManager } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useAnnotationContextManager";
import { useLighter, useLighterEventHandler } from "@fiftyone/lighter";
import { useCallback } from "react";

/**
 * Hook which registers event handlers related to renderer events.
 *
 * This should be called once in the composition root.
 */
export const useRegisterRendererEventHandlers = () => {
  const { scene } = useLighter();
  const handleLighterEvent = useLighterEventHandler(scene?.getEventChannel());
  const { entranceLabelId, clearEntranceLabelId } =
    useAnnotationContextManager();

  // If we entered annotation mode via direct label edit,
  // we want to select the label once it's been initialized and added to the
  // scene.
  handleLighterEvent(
    "lighter:overlay-added",
    useCallback(
      (evt) => {
        if (scene && entranceLabelId && evt.overlay.id === entranceLabelId) {
          scene.selectOverlay(evt.overlay.id);

          // one-time event; clear the selection criteria
          clearEntranceLabelId();
        }
      },
      [clearEntranceLabelId, entranceLabelId, scene]
    )
  );

  // todo 3d
};
