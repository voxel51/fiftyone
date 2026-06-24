import type { PerspectiveCamera, Vector3Tuple } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type Fo3dCameraControls = OrbitControlsImpl;

type CameraVector = Vector3 | Vector3Tuple;

const toVector3 = (value: CameraVector) => {
  if (value instanceof Vector3) {
    return value.clone();
  }

  return new Vector3(value[0], value[1], value[2]);
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
  position: CameraVector;
  target: CameraVector;
}) => {
  camera.position.copy(toVector3(position));
  controls.target.copy(toVector3(target));
  controls.update();
};

export const setCameraControlsPosition = ({
  camera,
  controls,
  position,
}: {
  camera: PerspectiveCamera;
  controls: Fo3dCameraControls;
  position: CameraVector;
}) => {
  camera.position.copy(toVector3(position));
  controls.update();
};
