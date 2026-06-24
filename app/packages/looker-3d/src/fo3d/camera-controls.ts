import type { PerspectiveCamera } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  areVectorsCoLocated,
  isFiniteVector3,
  toVector3,
  type Vector3Input,
} from "../utils";

export type Fo3dCameraControls = OrbitControlsImpl;

const MIN_CAMERA_TARGET_DISTANCE_SQUARED = 1e-8;
const DEFAULT_CAMERA_TARGET_DISTANCE = 1;
const FALLBACK_TARGET_DIRECTION = new Vector3(0, 0, -1);

const getCurrentViewOffset = (
  camera: PerspectiveCamera,
  controls: Fo3dCameraControls
) => {
  const offset = controls.target.clone().sub(camera.position);
  const distanceSquared = offset.lengthSq();

  if (
    distanceSquared > MIN_CAMERA_TARGET_DISTANCE_SQUARED &&
    isFiniteVector3(offset)
  ) {
    return {
      direction: offset.normalize(),
      distance: Math.sqrt(distanceSquared),
    };
  }

  const cameraDirection = new Vector3();
  camera.getWorldDirection(cameraDirection);

  if (
    cameraDirection.lengthSq() > MIN_CAMERA_TARGET_DISTANCE_SQUARED &&
    isFiniteVector3(cameraDirection)
  ) {
    return {
      direction: cameraDirection.normalize(),
      distance: DEFAULT_CAMERA_TARGET_DISTANCE,
    };
  }

  return {
    direction: FALLBACK_TARGET_DIRECTION.clone(),
    distance: DEFAULT_CAMERA_TARGET_DISTANCE,
  };
};

const ensureTargetAwayFromPosition = ({
  camera,
  controls,
  position,
  target,
}: {
  camera: PerspectiveCamera;
  controls: Fo3dCameraControls;
  position: Vector3;
  target: Vector3;
}) => {
  if (
    !areVectorsCoLocated(position, target, MIN_CAMERA_TARGET_DISTANCE_SQUARED)
  ) {
    return target;
  }

  const { direction, distance } = getCurrentViewOffset(camera, controls);

  return position.clone().add(direction.multiplyScalar(distance));
};

export const getCameraControlsTarget = (
  controls: Fo3dCameraControls,
  target = new Vector3()
) => {
  return target.copy(controls.target);
};

export const setCameraControlsLookAt = ({
  camera,
  controls,
  position,
  target,
}: {
  camera: PerspectiveCamera;
  controls: Fo3dCameraControls;
  position: Vector3Input;
  target: Vector3Input;
}) => {
  const nextPosition = toVector3(position);
  const nextTarget = ensureTargetAwayFromPosition({
    camera,
    controls,
    position: nextPosition,
    target: toVector3(target),
  });

  camera.position.copy(nextPosition);
  controls.target.copy(nextTarget);
  controls.update();
};

export const setCameraControlsPosition = ({
  camera,
  controls,
  position,
}: {
  camera: PerspectiveCamera;
  controls: Fo3dCameraControls;
  position: Vector3Input;
}) => {
  const nextPosition = toVector3(position);
  const nextTarget = ensureTargetAwayFromPosition({
    camera,
    controls,
    position: nextPosition,
    target: controls.target.clone(),
  });

  camera.position.copy(nextPosition);
  controls.target.copy(nextTarget);
  controls.update();
};
