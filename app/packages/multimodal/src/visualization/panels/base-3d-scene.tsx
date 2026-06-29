/* eslint-disable react/no-unknown-property */
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

type OrbitControlsHandle = {
  readonly target: MutableVectorHandle;
  update: () => void;
};

/**
 * Controlled camera pose for shared 3D views.
 */
export interface ThreeCameraPose {
  readonly position: VectorTuple;
  readonly target: VectorTuple;
}

/**
 * Props for the shared 3D visualization scene shell.
 */
export interface Base3DSceneProps {
  readonly cameraPose?: ThreeCameraPose | null;
  readonly children?: ReactNode;
  readonly onCameraPoseChange?: (pose: ThreeCameraPose) => void;
  readonly showGizmo?: boolean;
}

/**
 * Base 3D R3F scene with reusable navigation, axes, and Z-up coordinates.
 */
export function Base3DScene({
  cameraPose,
  children,
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
  onCameraPoseChange,
}: {
  readonly cameraPose?: ThreeCameraPose | null;
  readonly onCameraPoseChange?: (pose: ThreeCameraPose) => void;
}) {
  const applyingPoseRef = useRef(false);
  const lastEmittedPoseRef = useRef<ThreeCameraPose | null>(null);
  const [controls, setControls] = useState<OrbitControlsHandle | null>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const setControlsRef = useCallback((nextControls: unknown) => {
    setControls((nextControls as OrbitControlsHandle | null) ?? null);
  }, []);

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

  const handleChange = useCallback(() => {
    if (applyingPoseRef.current || !controls) {
      return;
    }

    const pose = cameraPoseFromScene(camera, controls);
    if (cameraPoseEquals(lastEmittedPoseRef.current, pose)) {
      return;
    }

    lastEmittedPoseRef.current = pose;
    onCameraPoseChange?.(pose);
  }, [camera, controls, onCameraPoseChange]);

  return (
    <OrbitControls
      enableDamping={false}
      makeDefault
      onChange={handleChange}
      ref={setControlsRef}
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

function cameraPoseEquals(
  first: ThreeCameraPose | null | undefined,
  second: ThreeCameraPose | null | undefined,
): boolean {
  if (!first || !second) {
    return first === second;
  }

  return (
    vectorTupleEquals(first.position, second.position) &&
    vectorTupleEquals(first.target, second.target)
  );
}

function vectorTupleEquals(first: VectorTuple, second: VectorTuple): boolean {
  return first.every(
    (value, index) => Math.abs(value - second[index]) <= CAMERA_POSE_EPSILON,
  );
}

function useZUpSceneCoordinates() {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

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
