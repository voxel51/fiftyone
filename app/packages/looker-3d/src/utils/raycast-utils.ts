import * as THREE from "three";
import { FO_USER_DATA } from "../constants";
import type { PointCloudCrop } from "./point-cloud-crop";
import { isPointInsidePointCloudCrop } from "./point-cloud-crop";

export const POINT_PICK_RADIUS_PX = 4;

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

export const filterIntersectionsForPointCloudCrop = (
  intersections: THREE.Intersection[],
  pointCloudCrop?: PointCloudCrop | null,
) => {
  if (!pointCloudCrop) {
    return intersections;
  }

  return intersections.filter((intersection) => {
    if (!(intersection.object instanceof THREE.Points)) {
      return true;
    }

    return isPointInsidePointCloudCrop(intersection.point, pointCloudCrop);
  });
};

const getPanelHeight = (panelElement: HTMLElement): number => {
  const rect = panelElement.getBoundingClientRect();
  return rect.height || panelElement.clientHeight || 0;
};

const getPerspectiveRaycastDepth = (
  camera: THREE.PerspectiveCamera,
  sceneBoundingBox?: THREE.Box3 | null,
): number => {
  if (sceneBoundingBox && !sceneBoundingBox.isEmpty()) {
    const sphere = sceneBoundingBox.getBoundingSphere(new THREE.Sphere());
    return Math.max(
      camera.near,
      camera.position.distanceTo(sphere.center) + sphere.radius,
    );
  }

  return Math.max(camera.near, camera.position.length());
};

export const getPointCloudRaycastThreshold = ({
  camera,
  panelElement,
  sceneBoundingBox,
  pickRadiusPx = POINT_PICK_RADIUS_PX,
}: {
  camera: THREE.Camera;
  panelElement: HTMLElement;
  sceneBoundingBox?: THREE.Box3 | null;
  pickRadiusPx?: number;
}): number => {
  const panelHeight = getPanelHeight(panelElement);
  if (panelHeight <= 0 || pickRadiusPx <= 0) {
    return 0;
  }

  if (camera instanceof THREE.OrthographicCamera) {
    const visibleWorldHeight = (camera.top - camera.bottom) / camera.zoom;
    return (visibleWorldHeight / panelHeight) * pickRadiusPx;
  }

  if (camera instanceof THREE.PerspectiveCamera) {
    const depth = getPerspectiveRaycastDepth(camera, sceneBoundingBox);
    const visibleWorldHeight =
      2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return (visibleWorldHeight / panelHeight) * pickRadiusPx;
  }

  return pickRadiusPx / panelHeight;
};

export const filterPointIntersectionsByScreenDistance = ({
  intersections,
  camera,
  panelElement,
  ndc,
  pickRadiusPx = POINT_PICK_RADIUS_PX,
}: {
  intersections: THREE.Intersection[];
  camera: THREE.Camera;
  panelElement: HTMLElement;
  ndc: { x: number; y: number };
  pickRadiusPx?: number;
}) => {
  const rect = panelElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || pickRadiusPx <= 0) {
    return intersections;
  }

  const pointerX = ((ndc.x + 1) / 2) * rect.width;
  const pointerY = ((1 - ndc.y) / 2) * rect.height;
  const maxDistanceSq = pickRadiusPx * pickRadiusPx;
  const projectedPoint = new THREE.Vector3();

  return intersections.filter((intersection) => {
    if (!(intersection.object instanceof THREE.Points)) {
      return true;
    }

    projectedPoint.copy(intersection.point).project(camera);
    if (
      !Number.isFinite(projectedPoint.x) ||
      !Number.isFinite(projectedPoint.y) ||
      projectedPoint.z < -1 ||
      projectedPoint.z > 1
    ) {
      return false;
    }

    const projectedX = ((projectedPoint.x + 1) / 2) * rect.width;
    const projectedY = ((1 - projectedPoint.y) / 2) * rect.height;
    const dx = projectedX - pointerX;
    const dy = projectedY - pointerY;

    return dx * dx + dy * dy <= maxDistanceSq;
  });
};
