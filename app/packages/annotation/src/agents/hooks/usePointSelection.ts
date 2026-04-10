import { useCallback } from "react";
import {
  InteractiveKeypointHandler,
  KeypointOptions,
  KeypointOverlay,
  UNDEFINED_LIGHTER_SCENE_ID,
  useLighter,
  useLighterEventBus,
} from "@fiftyone/lighter";
import { atom, useAtom } from "jotai";
import { v4 as uuidv4 } from "uuid";

export interface PointSelection {
  activate(): void;
  deactivate(): void;
  isActive: boolean;
}

/**
 * Maintains a reference to the keypoint overlay created for point selection.
 *
 * Overlay is created when point selection is activated, and removed when
 * point selection is deactivated.
 */
const keypointOverlayIdAtom = atom<string | null>(null);
const pointSelectionActiveAtom = atom(false);

/**
 * Hook which provides activation/deactivation functions for point selection.
 */
export const usePointSelection = (): PointSelection => {
  const { scene, overlayFactory } = useLighter();
  const eventBus = useLighterEventBus(
    scene?.getEventChannel() ?? UNDEFINED_LIGHTER_SCENE_ID
  );

  const [keypointOverlayId, setKeypointOverlayId] = useAtom(
    keypointOverlayIdAtom
  );
  const [isActive, setIsActive] = useAtom(pointSelectionActiveAtom);

  const activate = useCallback(() => {
    if (scene) {
      const overlay = overlayFactory.create<KeypointOptions, KeypointOverlay>(
        "keypoint",
        {
          id: uuidv4(),
          label: { label: "", points: [] },
          field: "",
        }
      );

      setKeypointOverlayId(overlay.id);
      scene.addOverlay(overlay);

      scene.enterInteractiveMode(
        new InteractiveKeypointHandler(overlay, eventBus)
      );

      setIsActive(true);
    }
  }, [eventBus, overlayFactory, scene, setIsActive, setKeypointOverlayId]);

  const deactivate = useCallback(() => {
    scene?.exitInteractiveMode();

    if (keypointOverlayId) {
      scene?.removeOverlay(keypointOverlayId);
      setKeypointOverlayId(null);
    }

    setIsActive(false);
  }, [keypointOverlayId, scene, setIsActive, setKeypointOverlayId]);

  return { activate, deactivate, isActive };
};
