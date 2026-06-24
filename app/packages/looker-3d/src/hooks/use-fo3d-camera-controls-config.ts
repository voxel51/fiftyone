import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { MOUSE } from "three";
import type { Fo3dCameraControls } from "../fo3d/camera-controls";
import {
  isFo3dShiftPressedAtom,
  isCreatingCuboidPointerDownAtom,
  isCurrentlyTransformingAtom,
  isSegmentingPointerDownAtom,
} from "../state";

type ModifierKey =
  | "shiftRight"
  | "shiftLeft"
  | "controlRight"
  | "controlLeft"
  | "metaRight"
  | "metaLeft";

// KeyboardEvent.code uses physical-key identifiers from the DOM spec.
// We track left/right keys independently so releasing one side does not
// unintentionally clear the other side's state.
const KEY_CODE_TO_MODIFIER: Record<string, ModifierKey> = {
  ShiftRight: "shiftRight",
  ShiftLeft: "shiftLeft",
  ControlRight: "controlRight",
  ControlLeft: "controlLeft",
  MetaRight: "metaRight",
  MetaLeft: "metaLeft",
};

interface UseFo3dCameraControlsConfigArgs {
  cameraControlsRef: React.RefObject<Fo3dCameraControls>;
}

/**
 * Syncs camera controls enablement and custom mouse modifiers.
 */
export const useFo3dCameraControlsConfig = ({
  cameraControlsRef,
}: UseFo3dCameraControlsConfigArgs) => {
  const isSegmentingPointerDown = useRecoilValue(isSegmentingPointerDownAtom);
  const isCreatingCuboidPointerDown = useRecoilValue(
    isCreatingCuboidPointerDownAtom
  );
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);
  const setIsFo3dShiftPressed = useSetRecoilState(isFo3dShiftPressedAtom);

  const keyState = useRef<Record<ModifierKey, boolean>>({
    shiftRight: false,
    shiftLeft: false,
    controlRight: false,
    controlLeft: false,
    metaRight: false,
    metaLeft: false,
  });
  const isShiftPressedRef = useRef(false);

  const setShiftPressed = useCallback(
    (isPressed: boolean) => {
      if (isShiftPressedRef.current === isPressed) {
        return;
      }

      isShiftPressedRef.current = isPressed;
      setIsFo3dShiftPressed(isPressed);
    },
    [setIsFo3dShiftPressed]
  );

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

    const isShiftPressed =
      keyState.current.shiftRight || keyState.current.shiftLeft;
    const isControlPressed =
      keyState.current.controlRight || keyState.current.controlLeft;
    const isMetaPressed =
      keyState.current.metaRight || keyState.current.metaLeft;

    // Modifier behavior:
    // - Shift + drag => pan via OrbitControls' built-in ROTATE modifier path
    // - Ctrl + drag  => dolly (zoom)
    // - Cmd + drag   => rotate by using OrbitControls' PAN modifier reversal
    // - default      => rotate
    if (isControlPressed) {
      cameraControlsRef.current.mouseButtons.LEFT = MOUSE.DOLLY;
    } else if (isMetaPressed && !isShiftPressed) {
      cameraControlsRef.current.mouseButtons.LEFT = MOUSE.PAN;
    } else {
      cameraControlsRef.current.mouseButtons.LEFT = MOUSE.ROTATE;
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
      setShiftPressed(
        keyState.current.shiftRight || keyState.current.shiftLeft
      );
      updateCameraControlsConfig();
    },
    [setShiftPressed, updateCameraControlsConfig]
  );

  const resetModifierState = useCallback(() => {
    for (const key of Object.keys(keyState.current) as ModifierKey[]) {
      keyState.current[key] = false;
    }

    setShiftPressed(false);
    updateCameraControlsConfig();
  }, [setShiftPressed, updateCameraControlsConfig]);

  // Global listeners are intentional: modifier keys can change even when canvas
  // focus/pointer state changes mid-interaction.
  fos.useEventHandler(document, "keydown", (e: KeyboardEvent) => {
    updateModifierState(e.code, true);
  });

  fos.useEventHandler(document, "keyup", (e: KeyboardEvent) => {
    updateModifierState(e.code, false);
  });

  fos.useEventHandler(window, "blur", resetModifierState);
};
