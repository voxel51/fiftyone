import * as THREE from "three";
import { FO_USER_DATA } from "../constants";

/**
 * Objects to exclude from raycasting (helpers, gizmos, UI elements, etc.)
 */
const EXCLUDED_OBJECT_TYPES = new Set([
  "GridHelper",
  "AxesHelper",
  "ArrowHelper",
  "BoxHelper",
  "Box3Helper",
  "CameraHelper",
  "DirectionalLightHelper",
  "HemisphereLightHelper",
  "PointLightHelper",
  "SpotLightHelper",
  "TransformControls",
  "TransformControlsPlane",
]);

/**
 * User data keys that indicate an object should be excluded from raycasting
 */
const EXCLUDED_USER_DATA_KEYS = [
  FO_USER_DATA.IS_HELPER,
  FO_USER_DATA.IS_ANNOTATION_PLANE,
];

/**
 * Check if an object should be included in raycasting.
 */
export function isRaycastable(object: THREE.Object3D): boolean {
  if (!object.visible) return false;

  if (EXCLUDED_OBJECT_TYPES.has(object.type)) return false;
  if (object.constructor && EXCLUDED_OBJECT_TYPES.has(object.constructor.name))
    return false;

  for (const key of EXCLUDED_USER_DATA_KEYS) {
    if (object.userData[key]) return false;
  }

  // Exclude objects without geometry (groups, empty objects)
  // But allow Points, Lines, and Meshes
  if (
    !(object instanceof THREE.Mesh) &&
    !(object instanceof THREE.Points) &&
    !(object instanceof THREE.Line) &&
    !(object instanceof THREE.LineSegments) &&
    !(object instanceof THREE.Sprite)
  ) {
    return false;
  }

  return true;
}

/**
 * Build a list of raycastable objects from the scene.
 */
export function getRaycastableObjects(scene: THREE.Scene): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];

  function traverse(object: THREE.Object3D) {
    if (isRaycastable(object)) {
      objects.push(object);
    }

    for (const child of object.children) {
      traverse(child);
    }
  }

  traverse(scene);
  return objects;
}
