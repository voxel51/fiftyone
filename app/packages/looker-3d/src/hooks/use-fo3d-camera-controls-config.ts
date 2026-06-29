import * as fos from "@fiftyone/state";
import type { CameraControls } from "@react-three/drei";
import CameraControlsImpl from "camera-controls";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue } from "recoil";
import {
  isCreatingCuboidPointerDownAtom,
  isCurrentlyTransformingAtom,
  isSegmentingPointerDownAtom,
} from "../state";

type ModifierKey = "shiftRight" | "shiftLeft" | "controlRight" | "controlLeft";

// KeyboardEvent.code uses physical-key identifiers from the DOM spec.
// We track left/right keys independently so releasing one side does not
// unintentionally clear the other side's state.
const KEY_CODE_TO_MODIFIER: Record<string, ModifierKey> = {
  ShiftRight: "shiftRight",
  ShiftLeft: "shiftLeft",
  ControlRight: "controlRight",
  ControlLeft: "controlLeft",
};

interface UseFo3dCameraControlsConfigArgs {
  cameraControlsRef: React.RefObject<CameraControls>;
}

/**
 * Syncs camera-controls enablement and custom mouse modifiers.
 */
export const useFo3dCameraControlsConfig = ({
  cameraControlsRef,
}: UseFo3dCameraControlsConfigArgs) => {
  const isSegmentingPointerDown = useRecoilValue(isSegmentingPointerDownAtom);
  const isCreatingCuboidPointerDown = useRecoilValue(
    isCreatingCuboidPointerDownAtom,
  );
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);

  const keyState = useRef<Record<ModifierKey, boolean>>({
    shiftRight: false,
    shiftLeft: false,
    controlRight: false,
    controlLeft: false,
  });

  const updateCameraControlsConfig = useCallback(() => {
    if (!cameraControlsRef.current) return;

    // Disable camera controls while drawing/transforming annotations.
    if (
      isSegmentingPointerDown ||
      isCreatingCuboidPointerDown ||
      isCurrentlyTransforming
    ) {
      cameraControlsRef.current.enabled = false;
      return;
    }

    cameraControlsRef.current.enabled = true;

    // Modifier behavior:
    // - Shift + drag => truck (pan)
    // - Ctrl + drag  => dolly (zoom)
    // - default      => rotate
    if (keyState.current.shiftRight || keyState.current.shiftLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.TRUCK;
    } else if (keyState.current.controlRight || keyState.current.controlLeft) {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.DOLLY;
    } else {
      cameraControlsRef.current.mouseButtons.left =
        CameraControlsImpl.ACTION.ROTATE;
    }
  }, [
    cameraControlsRef,
    isSegmentingPointerDown,
    isCreatingCuboidPointerDown,
    isCurrentlyTransforming,
  ]);

  // This effect reapplies camera control config on load -
  // and when interaction state changes (tracked in callback).
  useEffect(() => {
    updateCameraControlsConfig();
  }, [updateCameraControlsConfig]);

  const updateModifierState = useCallback(
    (eventCode: string, isPressed: boolean) => {
      const modifierKey = KEY_CODE_TO_MODIFIER[eventCode];
      if (!modifierKey) {
        return;
      }

      keyState.current[modifierKey] = isPressed;
      updateCameraControlsConfig();
    },
    [updateCameraControlsConfig],
  );

  // Global listeners are intentional: modifier keys can change even when canvas
  // focus/pointer state changes mid-interaction.
  fos.useEventHandler(document, "keydown", (e: KeyboardEvent) => {
    updateModifierState(e.code, true);
  });

  fos.useEventHandler(document, "keyup", (e: KeyboardEvent) => {
    updateModifierState(e.code, false);
  });
};
