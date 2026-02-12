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
 * Check if an object (and its entire subtree) should be excluded from raycasting.
 * When true, neither the object nor any of its descendants will be raycast.
 */
function isSubtreeExcluded(object: THREE.Object3D): boolean {
  if (!object.visible) return true;

  if (EXCLUDED_OBJECT_TYPES.has(object.type)) return true;
  if (object.constructor && EXCLUDED_OBJECT_TYPES.has(object.constructor.name))
    return true;

  for (const key of EXCLUDED_USER_DATA_KEYS) {
    if (object.userData[key]) return true;
  }

  return false;
}

/**
 * Check if an individual object is a raycastable geometry.
 */
function isRaycastableGeometry(object: THREE.Object3D): boolean {
  return (
    object instanceof THREE.Mesh ||
    object instanceof THREE.Points ||
    object instanceof THREE.Line ||
    object instanceof THREE.LineSegments ||
    object instanceof THREE.Sprite
  );
}

/**
 * Build a list of raycastable objects from the scene.
 */
export function getRaycastableObjects(scene: THREE.Scene): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];

  function traverse(object: THREE.Object3D) {
    if (isSubtreeExcluded(object)) return;

    if (isRaycastableGeometry(object)) {
      objects.push(object);
    }

    for (const child of object.children) {
      traverse(child);
    }
  }

  traverse(scene);
  return objects;
}
