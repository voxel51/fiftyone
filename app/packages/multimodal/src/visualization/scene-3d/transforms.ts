import * as THREE from "three";

import type { ScenePose3d } from "../../ir";
import type {
  PointCloudFrameTransform,
  PointCloudObjectTransform,
} from "./types";

export function pointCloudObjectTransform(
  frameTransform: PointCloudFrameTransform | undefined,
): PointCloudObjectTransform {
  if (!frameTransform) {
    return {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
  }

  const { rotation, translation } = frameTransform;
  const length = Math.hypot(rotation.w, rotation.x, rotation.y, rotation.z);
  if (length === 0) {
    return {
      position: [translation.x, translation.y, translation.z],
      quaternion: [0, 0, 0, 1],
    };
  }

  const normalizedRotation = rotation.clone().normalize();
  return {
    position: [translation.x, translation.y, translation.z],
    quaternion: [
      normalizedRotation.x,
      normalizedRotation.y,
      normalizedRotation.z,
      normalizedRotation.w,
    ],
  };
}

export function scenePoseObjectTransform(
  pose: ScenePose3d,
): PointCloudObjectTransform {
  const [x, y, z, w] = pose.quaternion;
  const length = Math.hypot(w, x, y, z);

  if (length === 0) {
    return {
      position: [pose.position[0], pose.position[1], pose.position[2]],
      quaternion: [0, 0, 0, 1],
    };
  }

  const normalizedRotation = new THREE.Quaternion(x, y, z, w).normalize();
  return {
    position: [pose.position[0], pose.position[1], pose.position[2]],
    quaternion: [
      normalizedRotation.x,
      normalizedRotation.y,
      normalizedRotation.z,
      normalizedRotation.w,
    ],
  };
}

export function matrixFromObjectTransform(
  transform: PointCloudObjectTransform,
) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion(...transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
}
