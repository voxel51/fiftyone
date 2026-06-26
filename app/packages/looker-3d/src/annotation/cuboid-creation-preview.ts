import * as THREE from "three";
import type { CuboidCreationState } from "../types";
import type { AnnotationPlaneState, CuboidTransformData } from "./types";

const MIN_DIMENSION = 0.1;
const DEFAULT_HEIGHT = 1;

export const getCuboidCreationPreview = (
  creationState: CuboidCreationState,
  annotationPlane: AnnotationPlaneState,
): CuboidTransformData | null => {
  const { step, centerPosition, orientationPoint, currentPosition } =
    creationState;

  if (!centerPosition || !currentPosition) {
    return null;
  }

  const center = new THREE.Vector3(...centerPosition);
  const current = new THREE.Vector3(...currentPosition);
  const planeQuaternion = new THREE.Quaternion(...annotationPlane.quaternion);
  const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(planeQuaternion);
  const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(planeQuaternion);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(planeQuaternion);

  if (step === 1) {
    const directionVector = current.clone().sub(center);
    const length = Math.max(directionVector.length(), MIN_DIMENSION);
    const localDirection = new THREE.Vector2(
      directionVector.dot(localX),
      directionVector.dot(localY),
    );
    const yaw = Math.atan2(localDirection.y, localDirection.x);
    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(normal, yaw);
    const finalQuaternion = yawQuaternion.multiply(planeQuaternion);
    const cuboidCenter = center.clone().add(current).multiplyScalar(0.5);

    return {
      location: cuboidCenter.toArray() as THREE.Vector3Tuple,
      dimensions: [length, MIN_DIMENSION, DEFAULT_HEIGHT],
      quaternion: finalQuaternion.toArray() as [number, number, number, number],
    };
  }

  if (step === 2 && orientationPoint) {
    const orientation = new THREE.Vector3(...orientationPoint);
    const directionVector = orientation.clone().sub(center);
    const length = Math.max(directionVector.length(), MIN_DIMENSION);
    const localDirection = new THREE.Vector2(
      directionVector.dot(localX),
      directionVector.dot(localY),
    );
    const yaw = Math.atan2(localDirection.y, localDirection.x);
    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(normal, yaw);
    const finalQuaternion = yawQuaternion.multiply(planeQuaternion);
    const centerToOrientation = directionVector.clone().normalize();
    const centerToCurrent = current.clone().sub(center);
    const projection = centerToOrientation
      .clone()
      .multiplyScalar(centerToCurrent.dot(centerToOrientation));
    const perpendicular = centerToCurrent.clone().sub(projection);
    const width = Math.max(perpendicular.length(), MIN_DIMENSION);
    const cuboidCenter = center.clone().add(orientation).multiplyScalar(0.5);

    if (perpendicular.length() > 0.001) {
      const perpendicularDirection = perpendicular.clone().normalize();
      cuboidCenter.add(perpendicularDirection.multiplyScalar(width / 2));
    }

    return {
      location: cuboidCenter.toArray() as THREE.Vector3Tuple,
      dimensions: [length, width, DEFAULT_HEIGHT],
      quaternion: finalQuaternion.toArray() as [number, number, number, number],
    };
  }

  return null;
};
