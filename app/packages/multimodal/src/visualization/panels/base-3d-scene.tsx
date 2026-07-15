/* eslint-disable react/no-unknown-property */
import { GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mix, screenUV, vec3 } from "three/tsl";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

const AXIS_COLORS: [string, string, string] = ["#ef4444", "#22c55e", "#3b82f6"];
const AXIS_LABEL_COLOR = "#f8fafc";
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.8;
const GIZMO_MARGIN_PIXELS: [number, number] = [42, 42];
const GIZMO_RENDER_PRIORITY = 1;
const CAMERA_POSE_EPSILON = 0.000001;
const DEFAULT_FOCUS_DIRECTION = new THREE.Vector3(1, -1, 0.75).normalize();
const FOCUS_PADDING = 1.2;
const MIN_FOCUS_RADIUS = 1;

type VectorTuple = readonly [number, number, number];
export type ThreeSceneUpAxis = "x" | "y" | "z";

const SCENE_UP_AXES: Record<
  ThreeSceneUpAxis,
  readonly [number, number, number]
> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

// OrbitControls scales both its dolly step and its pan step with the
// camera→target distance, so zoom and pan grind to a halt as the camera
// closes in on the target. Below this floor, continuing to zoom in
// pushes the target ahead of the camera instead (fly-through), keeping
// a constant working distance — and therefore constant zoom/pan speed.
const ORBIT_ZOOM_DISTANCE_FLOOR_M = 2;

// 20% smaller than drei's default so the gizmo crowds the scene less.
const GIZMO_SCALE = 0.7;

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

/**
 * Scene backdrop fill: one flat color, or a vertical screen-space
 * gradient from `top` to `bottom`.
 */
export type ThreeSceneBackground =
  | { readonly color: string; readonly kind: "solid" }
  | {
      readonly bottom: string;
      readonly kind: "gradient";
      readonly top: string;
    };

const DEFAULT_SCENE_BACKGROUND: ThreeSceneBackground = {
  color: VISUALIZATION_PANEL_BACKGROUND_COLOR,
  kind: "solid",
};

export type ThreeCameraPoseChangeSource = "focus" | "initial" | "interaction";

/**
 * Props for the shared 3D visualization scene shell.
 */
export interface Base3DSceneProps {
  /** Backdrop fill; defaults to the shared dark panel color. */
  readonly background?: ThreeSceneBackground;
  readonly cameraPose?: ThreeCameraPose | null;
  readonly children?: ReactNode;
  readonly focusSceneRequestKey?: number;
  readonly onCameraPoseChange?: (
    pose: ThreeCameraPose,
    source: ThreeCameraPoseChangeSource,
  ) => void;
  readonly showGizmo?: boolean;
  /** World axis OrbitControls and the camera treat as up. @default "z" */
  readonly up?: ThreeSceneUpAxis;
}

/**
 * Base 3D R3F scene with reusable navigation, axes, and scene-up coordinates.
 */
export function Base3DScene({
  background = DEFAULT_SCENE_BACKGROUND,
  cameraPose,
  children,
  focusSceneRequestKey,
  onCameraPoseChange,
  showGizmo = true,
  up = "z",
}: Base3DSceneProps) {
  useSceneUpCoordinates(up);

  return (
    <>
      <SceneBackground background={background} />
      <ambientLight intensity={DEFAULT_AMBIENT_LIGHT_INTENSITY} />
      {children}
      <ControlledOrbitControls
        cameraPose={cameraPose}
        focusSceneRequestKey={focusSceneRequestKey}
        onCameraPoseChange={onCameraPoseChange}
      />
      {showGizmo ? (
        <GizmoHelper
          alignment="top-left"
          margin={GIZMO_MARGIN_PIXELS}
          renderPriority={GIZMO_RENDER_PRIORITY}
        >
          <mesh scale={GIZMO_SCALE}>
            <GizmoViewport
              axisColors={AXIS_COLORS}
              labelColor={AXIS_LABEL_COLOR}
            />
          </mesh>
        </GizmoHelper>
      ) : null}
    </>
  );
}

/**
 * `backgroundNode` is a WebGPU-renderer extension of Scene that the
 * pinned three types don't surface.
 */
type SceneBackgroundHandle = {
  background: unknown;
  backgroundNode: unknown;
};

/**
 * Syncs the three scene's backdrop with the configured fill: a plain
 * `scene.background` color for solids, a screen-space TSL gradient via
 * `scene.backgroundNode` otherwise. Exported for tests.
 */
export function SceneBackground({
  background,
}: {
  readonly background: ThreeSceneBackground;
}) {
  const scene = useThree(
    (state) => state.scene,
  ) as unknown as SceneBackgroundHandle;
  const invalidate = useThree((state) => state.invalidate);

  const solidColor = background.kind === "solid" ? background.color : null;
  const gradientTop = background.kind === "gradient" ? background.top : null;
  const gradientBottom =
    background.kind === "gradient" ? background.bottom : null;

  // This effect writes the configured fill onto the scene (an external
  // three object) and clears it on unmount so the next scene owner
  // starts from a clean slate.
  useEffect(() => {
    if (solidColor !== null) {
      scene.background = new THREE.Color(solidColor);
      scene.backgroundNode = null;
    } else if (gradientTop !== null && gradientBottom !== null) {
      // THREE.Color converts the sRGB hex values into linear space.
      const top = new THREE.Color(gradientTop);
      const bottom = new THREE.Color(gradientBottom);
      scene.background = null;
      // screenUV.y is 0 at the top of the canvas under WebGPU.
      scene.backgroundNode = mix(
        vec3(top.r, top.g, top.b),
        vec3(bottom.r, bottom.g, bottom.b),
        screenUV.y,
      );
    }
    invalidate();

    return () => {
      scene.background = null;
      scene.backgroundNode = null;
    };
  }, [gradientBottom, gradientTop, invalidate, scene, solidColor]);

  return null;
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
  const gl = useThree((state) => state.gl);
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

  // This effect keeps zoom-in usable at close range: after OrbitControls
  // processes a wheel tick, a camera→target distance below the floor
  // pushes the target back out along the view direction. The camera
  // itself doesn't move here — the next dolly tick advances it at
  // floor-scaled (constant) speed instead of asymptotically stalling.
  useEffect(() => {
    const element = gl?.domElement as HTMLElement | undefined;
    if (!controls || !element) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0 || applyingPoseRef.current) {
        return;
      }
      const dx = controls.target.x - camera.position.x;
      const dy = controls.target.y - camera.position.y;
      const dz = controls.target.z - camera.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= ORBIT_ZOOM_DISTANCE_FLOOR_M || distance === 0) {
        return;
      }
      const scale = ORBIT_ZOOM_DISTANCE_FLOOR_M / distance;
      controls.target.set(
        camera.position.x + dx * scale,
        camera.position.y + dy * scale,
        camera.position.z + dz * scale,
      );
      // Bracket as an interaction so the resulting change event reports
      // the new pose upstream (follow modes re-derive their anchors).
      interactingRef.current = true;
      controls.update();
      interactingRef.current = false;
      invalidate();
    };
    // Registered after OrbitControls' own wheel listener (the controls
    // instance exists first), so the dolly has already been applied.
    element.addEventListener("wheel", handleWheel, { passive: true });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [camera, controls, gl, invalidate]);

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

function useSceneUpCoordinates(up: ThreeSceneUpAxis) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [x, y, z] = SCENE_UP_AXES[up];

  // This layout effect switches the camera to the requested scene-up axis while
  // the scene is mounted and restores the previous up vector on cleanup.
  useLayoutEffect(() => {
    const previousUp = camera.up.clone();

    camera.up.set(x, y, z);
    camera.updateProjectionMatrix();
    invalidate();

    return () => {
      camera.up.copy(previousUp);
      camera.updateProjectionMatrix();
      invalidate();
    };
  }, [camera, invalidate, x, y, z]);
}
