/* eslint-disable react/no-unknown-property */
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

const AXIS_COLORS: [string, string, string] = ["#ef4444", "#22c55e", "#3b82f6"];
const AXIS_LABEL_COLOR = "#f8fafc";
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.8;
const GIZMO_MARGIN_PIXELS: [number, number] = [72, 72];
const GIZMO_RENDER_PRIORITY = 1;
const CAMERA_POSE_EPSILON = 0.000001;
const DEFAULT_FOCUS_DIRECTION = new THREE.Vector3(1, -1, 0.75).normalize();
const FOCUS_PADDING = 1.2;
const MIN_FOCUS_RADIUS = 1;
const Z_UP_AXIS = { x: 0, y: 0, z: 1 } as const;

type VectorTuple = readonly [number, number, number];

type MutableVectorHandle = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  set: (x: number, y: number, z: number) => unknown;
};

type CameraHandle = {
  readonly position: MutableVectorHandle;
};

type FocusCameraHandle = CameraHandle & {
  readonly isPerspectiveCamera?: boolean;
  readonly fov?: number;
  updateProjectionMatrix: () => void;
};

type OrbitControlsHandle = {
  readonly target: MutableVectorHandle;
  update: () => void;
};

type SceneHandle = {
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void;
};

/**
 * Controlled camera pose for shared 3D views.
 */
export interface ThreeCameraPose {
  readonly position: VectorTuple;
  readonly target: VectorTuple;
}

export type ThreeCameraPoseChangeSource = "focus" | "initial" | "interaction";

/**
 * Props for the shared 3D visualization scene shell.
 */
export interface Base3DSceneProps {
  readonly cameraPose?: ThreeCameraPose | null;
  readonly children?: ReactNode;
  readonly focusSceneRequestKey?: number;
  readonly onCameraPoseChange?: (
    pose: ThreeCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly showGizmo?: boolean;
}

/**
 * Base 3D R3F scene with reusable navigation, axes, and Z-up coordinates.
 */
export function Base3DScene({
  cameraPose,
  children,
  focusSceneRequestKey,
  onCameraPoseChange,
  showGizmo = true,
}: Base3DSceneProps) {
  useZUpSceneCoordinates();

  return (
    <>
      <color
        args={[VISUALIZATION_PANEL_BACKGROUND_COLOR]}
        attach="background"
      />
      <ambientLight intensity={DEFAULT_AMBIENT_LIGHT_INTENSITY} />
      {children}
      <ControlledOrbitControls
        cameraPose={cameraPose}
        focusSceneRequestKey={focusSceneRequestKey}
        onCameraPoseChange={onCameraPoseChange}
      />
      {showGizmo ? (
        <GizmoHelper
          alignment="top-right"
          margin={GIZMO_MARGIN_PIXELS}
          renderPriority={GIZMO_RENDER_PRIORITY}
        >
          <GizmoViewport
            axisColors={AXIS_COLORS}
            labelColor={AXIS_LABEL_COLOR}
          />
        </GizmoHelper>
      ) : null}
    </>
  );
}

function ControlledOrbitControls({
  cameraPose,
  focusSceneRequestKey,
  onCameraPoseChange,
}: {
  readonly cameraPose?: ThreeCameraPose | null;
  readonly focusSceneRequestKey?: number;
  readonly onCameraPoseChange?: (
    pose: ThreeCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
}) {
  const applyingPoseRef = useRef(false);
  const emittedInitialPoseRef = useRef(false);
  const interactingRef = useRef(false);
  const lastEmittedPoseRef = useRef<ThreeCameraPose | null>(null);
  const [controls, setControls] = useState<OrbitControlsHandle | null>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const setControlsRef = useCallback((nextControls: unknown) => {
    setControls((nextControls as OrbitControlsHandle | null) ?? null);
  }, []);

  // This layout effect applies an externally controlled camera pose before the
  // next paint so the camera and OrbitControls target move together.
  useLayoutEffect(() => {
    if (!cameraPose || !controls) {
      return;
    }

    if (!cameraPoseEquals(cameraPoseFromScene(camera, controls), cameraPose)) {
      applyingPoseRef.current = true;
      setCameraPose(camera, controls, cameraPose);
      controls.update();
      invalidate();
      applyingPoseRef.current = false;
    }

    lastEmittedPoseRef.current = cameraPose;
  }, [camera, cameraPose, controls, invalidate]);

  // This layout effect emits the initial camera pose once OrbitControls is
  // available to downstream consumers.
  useLayoutEffect(() => {
    if (!controls || emittedInitialPoseRef.current) {
      return;
    }

    emittedInitialPoseRef.current = true;
    const pose = cameraPoseFromScene(camera, controls);
    lastEmittedPoseRef.current = pose;
    onCameraPoseChange?.(pose, "initial");
  }, [camera, controls, onCameraPoseChange]);

  // This layout effect focuses the camera on current scene bounds when a
  // caller requests an explicit recenter.
  useLayoutEffect(() => {
    if (focusSceneRequestKey === undefined || !controls) {
      return;
    }

    applyingPoseRef.current = true;
    const pose = focusCameraOnScene({
      camera,
      controls,
      scene,
      viewportHeight: size.height,
      viewportWidth: size.width,
    });
    applyingPoseRef.current = false;

    if (!pose) {
      return;
    }

    lastEmittedPoseRef.current = pose;
    onCameraPoseChange?.(pose, "focus");
    invalidate();
  }, [
    camera,
    controls,
    focusSceneRequestKey,
    invalidate,
    onCameraPoseChange,
    scene,
    size.height,
    size.width,
  ]);

  const handleStart = useCallback(() => {
    interactingRef.current = true;
  }, []);
  const handleEnd = useCallback(() => {
    interactingRef.current = false;
  }, []);
  const handleChange = useCallback(() => {
    // Programmatic camera writes also make OrbitControls dispatch `change`.
    // Only changes bracketed by user interaction should be reported upstream.
    if (applyingPoseRef.current || !interactingRef.current || !controls) {
      return;
    }

    const pose = cameraPoseFromScene(camera, controls);
    if (cameraPoseEquals(lastEmittedPoseRef.current, pose)) {
      return;
    }

    lastEmittedPoseRef.current = pose;
    onCameraPoseChange?.(pose, "interaction");
  }, [camera, controls, onCameraPoseChange]);

  return (
    <OrbitControls
      enableDamping={false}
      makeDefault
      onChange={handleChange}
      onEnd={handleEnd}
      onStart={handleStart}
      ref={setControlsRef}
      zoomToCursor
    />
  );
}

function setCameraPose(
  camera: CameraHandle,
  controls: OrbitControlsHandle,
  pose: ThreeCameraPose,
) {
  camera.position.set(...pose.position);
  controls.target.set(...pose.target);
}

function cameraPoseFromScene(
  camera: CameraHandle,
  controls: OrbitControlsHandle,
): ThreeCameraPose {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  };
}

function focusCameraOnScene({
  camera,
  controls,
  scene,
  viewportHeight,
  viewportWidth,
}: {
  readonly camera: FocusCameraHandle;
  readonly controls: OrbitControlsHandle;
  readonly scene: SceneHandle;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}): ThreeCameraPose | null {
  scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(
    scene as unknown as THREE.Object3D,
  );
  if (bounds.isEmpty()) {
    return null;
  }

  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, MIN_FOCUS_RADIUS);
  const direction = vectorFromHandle(camera.position).sub(
    vectorFromHandle(controls.target),
  );
  if (direction.lengthSq() <= CAMERA_POSE_EPSILON) {
    direction.copy(DEFAULT_FOCUS_DIRECTION);
  } else {
    direction.normalize();
  }

  const distance = focusDistanceForCamera({
    camera,
    radius,
    viewportHeight,
    viewportWidth,
  });
  const position = sphere.center
    .clone()
    .add(direction.multiplyScalar(distance));

  camera.position.set(position.x, position.y, position.z);
  controls.target.set(sphere.center.x, sphere.center.y, sphere.center.z);
  camera.updateProjectionMatrix();
  controls.update();

  return cameraPoseFromScene(camera, controls);
}

function focusDistanceForCamera({
  camera,
  radius,
  viewportHeight,
  viewportWidth,
}: {
  readonly camera: FocusCameraHandle;
  readonly radius: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}) {
  if (camera.isPerspectiveCamera === true && typeof camera.fov === "number") {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const aspect =
      viewportHeight > 0 && viewportWidth > 0
        ? viewportWidth / viewportHeight
        : 1;
    const horizontalFov =
      2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.000001));
    const verticalDistance = radius / Math.sin(verticalFov / 2);
    const horizontalDistance = radius / Math.sin(horizontalFov / 2);

    return Math.max(verticalDistance, horizontalDistance) * FOCUS_PADDING;
  }

  return radius * 3 * FOCUS_PADDING;
}

function vectorFromHandle(handle: MutableVectorHandle): THREE.Vector3 {
  return new THREE.Vector3(handle.x, handle.y, handle.z);
}

function cameraPoseEquals(
  first: ThreeCameraPose | null | undefined,
  second: ThreeCameraPose | null | undefined,
  epsilon = CAMERA_POSE_EPSILON,
): boolean {
  if (!first || !second) {
    return first === second;
  }

  return (
    vectorTupleEquals(first.position, second.position, epsilon) &&
    vectorTupleEquals(first.target, second.target, epsilon)
  );
}

function vectorTupleEquals(
  first: VectorTuple,
  second: VectorTuple,
  epsilon = CAMERA_POSE_EPSILON,
): boolean {
  return first.every(
    (value, index) => Math.abs(value - second[index]) <= epsilon,
  );
}

function useZUpSceneCoordinates() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  // This layout effect switches the camera to Z-up coordinates while the scene
  // is mounted and restores the previous up vector on cleanup.
  useLayoutEffect(() => {
    const previousUp = camera.up.clone();

    camera.up.set(Z_UP_AXIS.x, Z_UP_AXIS.y, Z_UP_AXIS.z);
    camera.updateProjectionMatrix();
    invalidate();

    return () => {
      camera.up.copy(previousUp);
      camera.updateProjectionMatrix();
      invalidate();
    };
  }, [camera, invalidate]);
}
