import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  Mcap3dCameraRigController,
  type Mcap3dCameraRigCallbacks,
  type Mcap3dCameraRigInputs,
  type RigCameraHandle,
  type RigControlsHandle,
} from "./mcap-3d-camera-rig-core";

export type Mcap3dCameraRigProps = Mcap3dCameraRigInputs &
  Mcap3dCameraRigCallbacks;

/**
 * R3F binding for {@link Mcap3dCameraRigController}: mounts inside the 3D
 * canvas, attaches to the OrbitControls instance the scene shell registers
 * via `makeDefault`, and pushes follow-config/target updates into the
 * controller. Renders nothing.
 *
 * Props and callbacks are read through a per-render ref so the controller's
 * long-lived event listeners never act on the closures that registered them
 * — a mode or frame switch mid-gesture must re-base under the current
 * configuration, and hook callbacks are free to change identity per render.
 */
export function Mcap3dCameraRig(props: Mcap3dCameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as RigControlsHandle | null;
  const invalidate = useThree((state) => state.invalidate);
  const propsRef = useRef(props);
  propsRef.current = props;
  const controllerRef = useRef<Mcap3dCameraRigController | null>(null);

  // This layout effect owns the controller lifecycle: `state.controls` is
  // null until the shell's OrbitControls registers via makeDefault, and the
  // controller rebinds if the camera/controls/canvas identity changes.
  useLayoutEffect(() => {
    if (!controls) {
      return undefined;
    }
    const controller = new Mcap3dCameraRigController(
      camera as unknown as RigCameraHandle,
      controls,
      invalidate,
      {
        onCommit: (pose, anchor) => propsRef.current.onCommit(pose, anchor),
        onGestureStart: (pose) => propsRef.current.onGestureStart(pose),
        onPoseSample: (sample) => propsRef.current.onPoseSample(sample),
      },
      rigInputs(propsRef.current),
    );
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [camera, controls, invalidate]);

  // This layout effect pushes input changes (target-pose ticks, mode/frame
  // switches, anchor adoption) into the controller before paint, so follow
  // composition lands in the same frame as the content it tracks.
  useLayoutEffect(() => {
    controllerRef.current?.sync(rigInputs(propsRef.current));
  }, [
    controls,
    props.adoptAnchor,
    props.mode,
    props.sceneUpAxis,
    props.targetFrameId,
    props.targetResolution,
    props.worldFrameId,
  ]);

  return null;
}

function rigInputs(props: Mcap3dCameraRigProps): Mcap3dCameraRigInputs {
  return {
    adoptAnchor: props.adoptAnchor,
    mode: props.mode,
    sceneUpAxis: props.sceneUpAxis,
    targetFrameId: props.targetFrameId,
    targetResolution: props.targetResolution,
    worldFrameId: props.worldFrameId,
  };
}
