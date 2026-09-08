import * as fos from "@fiftyone/state";
import { useCallback, useEffect, useRef } from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { MOUSE } from "three";
import type { Fo3dCameraControls } from "../fo3d/camera-controls";
import {
  isFo3dPointCropModifierPressedAtom,
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
  | "metaLeft"
  // Alt keys are tracked only for the point-crop modifier; they are not part
  // of the mouseButtons (rotate/pan/dolly) mapping below.
  | "altRight"
  | "altLeft";

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
  AltRight: "altRight",
  AltLeft: "altLeft",
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
    isCreatingCuboidPointerDownAtom,
  );
  const isCurrentlyTransforming = useRecoilValue(isCurrentlyTransformingAtom);
  const setIsPointCropModifierPressed = useSetRecoilState(
    isFo3dPointCropModifierPressedAtom,
  );

  const keyState = useRef<Record<ModifierKey, boolean>>({
    shiftRight: false,
    shiftLeft: false,
    controlRight: false,
    controlLeft: false,
    metaRight: false,
    metaLeft: false,
    altRight: false,
    altLeft: false,
  });
  const isPointCropModifierPressedRef = useRef(false);

  const setPointCropModifierPressed = useCallback(
    (isPressed: boolean) => {
      if (isPointCropModifierPressedRef.current === isPressed) {
        return;
      }

      isPointCropModifierPressedRef.current = isPressed;
      setIsPointCropModifierPressed(isPressed);
    },
    [setIsPointCropModifierPressed],
  );

  const updateCameraControlsConfig = useCallback(() => {
    if (!cameraControlsRef.current) return;

    // Keep wheel zoom available while annotations own pointer drags.
    if (
      isSegmentingPointerDown ||
      isCreatingCuboidPointerDown ||
      isCurrentlyTransforming
    ) {
      cameraControlsRef.current.enabled = true;
      cameraControlsRef.current.enableRotate = false;
      cameraControlsRef.current.enablePan = false;
      cameraControlsRef.current.enableZoom = true;
      cameraControlsRef.current.mouseButtons.LEFT = MOUSE.ROTATE;
      return;
    }

    cameraControlsRef.current.enabled = true;
    cameraControlsRef.current.enableRotate = true;
    cameraControlsRef.current.enablePan = true;
    cameraControlsRef.current.enableZoom = true;

    const isShiftPressed =
      keyState.current.shiftRight || keyState.current.shiftLeft;
    const isControlPressed =
      keyState.current.controlRight || keyState.current.controlLeft;
    const isMetaPressed =
      keyState.current.metaRight || keyState.current.metaLeft;

    // Left-drag modifier behavior:
    // - Ctrl + drag        => dolly (zoom)
    // - Cmd (no Shift)     => pan
    // - default (incl.
    //   Shift, Cmd+Shift)  => rotate
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
      setPointCropModifierPressed(
        keyState.current.shiftRight ||
          keyState.current.shiftLeft ||
          keyState.current.metaRight ||
          keyState.current.metaLeft ||
          keyState.current.altRight ||
          keyState.current.altLeft,
      );
      updateCameraControlsConfig();
    },
    [setPointCropModifierPressed, updateCameraControlsConfig],
  );

  const resetModifierState = useCallback(() => {
    for (const key of Object.keys(keyState.current) as ModifierKey[]) {
      keyState.current[key] = false;
    }

    setPointCropModifierPressed(false);
    updateCameraControlsConfig();
  }, [setPointCropModifierPressed, updateCameraControlsConfig]);
  const resetModifierStateRef = useRef(resetModifierState);
  resetModifierStateRef.current = resetModifierState;

  // Global listeners are intentional: modifier keys can change even when canvas
  // focus/pointer state changes mid-interaction.
  fos.useEventHandler(document, "keydown", (e: KeyboardEvent) => {
    updateModifierState(e.code, true);
  });

  fos.useEventHandler(document, "keyup", (e: KeyboardEvent) => {
    updateModifierState(e.code, false);
  });

  fos.useEventHandler(window, "blur", resetModifierState);

  useEffect(() => {
    return () => {
      resetModifierStateRef.current();
    };
  }, []);
};
