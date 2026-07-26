import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  Scene3dCameraRigController,
  type Scene3dCameraRigCallbacks,
  type Scene3dCameraRigInputs,
  type RigCameraHandle,
  type RigControlsHandle,
} from "./scene-3d-camera-rig-core";

export type Scene3dCameraRigProps = Scene3dCameraRigInputs &
  Scene3dCameraRigCallbacks;

/** External-store boundary for driving the camera rig without React commits. */
export interface Scene3dCameraRigStore {
  getSnapshot(): Scene3dCameraRigProps;
  publish(next: Scene3dCameraRigProps): void;
  subscribe(listener: () => void): () => void;
}

/** Creates one imperative camera-rig input store for a mounted 3D tile. */
export function createScene3dCameraRigStore(
  initial: Scene3dCameraRigProps,
): Scene3dCameraRigStore {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    publish: (next) => {
      const inputsChanged = !cameraRigInputsEqual(snapshot, next);
      snapshot = next;
      if (!inputsChanged) return;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * R3F binding for {@link Scene3dCameraRigController}: mounts inside the 3D
 * canvas, attaches to the OrbitControls instance the scene shell registers
 * via `makeDefault`, and pushes follow-config/target updates into the
 * controller. Renders nothing.
 *
 * Props and callbacks are read through a per-render ref so the controller's
 * long-lived event listeners never act on the closures that registered them
 * — a mode or frame switch mid-gesture must re-base under the current
 * configuration, and hook callbacks are free to change identity per render.
 */
export function Scene3dCameraRig(props: Scene3dCameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as RigControlsHandle | null;
  const invalidate = useThree((state) => state.invalidate);
  const propsRef = useRef(props);
  propsRef.current = props;
  const controllerRef = useRef<Scene3dCameraRigController | null>(null);

  // This layout effect owns the controller lifecycle: `state.controls` is
  // null until the shell's OrbitControls registers via makeDefault, and the
  // controller rebinds if the camera/controls/canvas identity changes.
  useLayoutEffect(() => {
    if (!controls) {
      return undefined;
    }
    const controller = new Scene3dCameraRigController(
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

/**
 * Stable R3F binding for a camera rig driven through an external store.
 * Playback updates synchronize the Three controller directly and invalidate
 * the canvas without reconciling its React/Fiber ancestry.
 */
export function Scene3dCameraRigFromStore({
  store,
}: {
  readonly store: Scene3dCameraRigStore;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as RigControlsHandle | null;
  const invalidate = useThree((state) => state.invalidate);

  // This layout effect owns both the Three controller and the external-store
  // subscription. Callback dispatch reads the latest snapshot at call time.
  useLayoutEffect(() => {
    if (!controls) return undefined;
    const initial = store.getSnapshot();
    const controller = new Scene3dCameraRigController(
      camera as unknown as RigCameraHandle,
      controls,
      invalidate,
      {
        onCommit: (pose, anchor) => store.getSnapshot().onCommit(pose, anchor),
        onGestureStart: (pose) => store.getSnapshot().onGestureStart(pose),
        onPoseSample: (sample) => store.getSnapshot().onPoseSample(sample),
      },
      rigInputs(initial),
    );
    const unsubscribe = store.subscribe(() => {
      controller.sync(rigInputs(store.getSnapshot()));
    });
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [camera, controls, invalidate, store]);

  return null;
}

function rigInputs(props: Scene3dCameraRigProps): Scene3dCameraRigInputs {
  return {
    adoptAnchor: props.adoptAnchor,
    mode: props.mode,
    sceneUpAxis: props.sceneUpAxis,
    targetFrameId: props.targetFrameId,
    targetResolution: props.targetResolution,
    worldFrameId: props.worldFrameId,
  };
}

function cameraRigInputsEqual(
  left: Scene3dCameraRigProps,
  right: Scene3dCameraRigProps,
): boolean {
  return (
    left.adoptAnchor === right.adoptAnchor &&
    left.mode === right.mode &&
    left.sceneUpAxis === right.sceneUpAxis &&
    left.targetFrameId === right.targetFrameId &&
    left.targetResolution === right.targetResolution &&
    left.worldFrameId === right.worldFrameId
  );
}
