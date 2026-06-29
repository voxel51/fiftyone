import * as THREE from "three";
import {
  PANEL_ID_MAIN,
  VIEW_TYPE_BACK,
  VIEW_TYPE_BOTTOM,
  VIEW_TYPE_FRONT,
  VIEW_TYPE_LEFT,
  VIEW_TYPE_RIGHT,
  VIEW_TYPE_TOP,
} from "../constants";
import type {
  MainPanelPanSyncIntent,
  MainPanelZoomSyncIntent,
  PanelId,
  RaycastResult,
  SidePanelViewType,
} from "../types";
import type { PointCloudCrop } from "./point-cloud-crop";
import { isPointInsidePointCloudCrop } from "./point-cloud-crop";

export const MAIN_PANEL_ORBIT_ZOOM_SPEED = 0.95;
export const MAIN_PANEL_ZOOM_SYNC_MAX_AGE_MS = 250;
export const MAIN_PANEL_PAN_SYNC_MAX_AGE_MS = 250;
export const MAIN_PANEL_PAN_SYNC_INTERVAL_MS = 80;
export const MAIN_PANEL_PAN_SYNC_TARGET_EPSILON_SQ = 1e-10;
export const SIDE_PANEL_PAN_SYNC_DAMPING = 0.35;
export const SIDE_PANEL_SYNC_MIN_ZOOM = 0.01;
export const SIDE_PANEL_SYNC_MAX_ZOOM = 10000;
export const SIDE_PANEL_PERSPECTIVE_ZOOM_GAIN = 1.5;

export const ORBIT_CONTROLS_WHEEL_ZOOM_BASE = 0.95;
const DEFAULT_SIDE_PANEL_CAMERA_DISTANCE = 10;

// An up-vector component this dominant is treated as axis-aligned, letting the
// cardinal views snap to exact world axes instead of derived cross products.
const AXIS_ALIGNMENT_THRESHOLD = 0.9;
// Shortest a derived camera-up may be before we fall back to a world axis.
const MIN_DERIVED_UP_LENGTH = 0.1;

interface CreateMainPanelZoomSyncIntentOptions {
  activeCursorPanel: PanelId | null;
  camera?: THREE.Camera;
  deltaY: number;
  id: string;
  raycastResult: RaycastResult;
  timestamp: number;
  zoomSpeed?: number;
}

interface CreateMainPanelPanSyncIntentOptions {
  id: string;
  isMainPanelPointerDrag: boolean;
  raycastResult: RaycastResult;
  timestamp: number;
}

interface ShouldApplyMainPanelNavigationSyncIntentOptions {
  activeCrop?: PointCloudCrop | null;
  intent: MainPanelPanSyncIntent | MainPanelZoomSyncIntent;
  maxAgeMs?: number;
  now: number;
}

export interface SidePanelControls {
  target?: THREE.Vector3;
  update?: () => void;
  minZoom?: number;
  maxZoom?: number;
}

interface ApplyMainPanelZoomSyncIntentOptions {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  intent: MainPanelZoomSyncIntent;
  invalidate?: () => void;
}

interface ApplyMainPanelZoomSyncOptions {
  anchor: THREE.Vector3;
  camera: THREE.Camera;
  controls?: SidePanelControls;
  invalidate?: () => void;
  visibleWorldHeightAtAnchor?: number | null;
  zoomRatio: number;
}

interface ApplyPointCloudCropMainPanelSyncOptions {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  crop: PointCloudCrop;
  invalidate?: () => void;
}

interface ApplyVisibleWorldHeightZoomOptions {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  invalidate?: () => void;
  visibleWorldHeight?: number | null;
}

interface ApplyMainPanelPanSyncIntentOptions {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  damping?: number;
  intent: MainPanelPanSyncIntent;
  invalidate?: () => void;
}

interface ApplySidePanelCameraFrameOptions {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  frame: SidePanelCameraFrame;
  invalidate?: () => void;
}

interface DeriveSidePanelCameraFrameOptions {
  distance?: number;
  sceneBoundingBox?: THREE.Box3 | null;
  target: THREE.Vector3;
  upVector: THREE.Vector3;
  viewType: SidePanelViewType;
}

interface DeriveSidePanelCameraUpdateFromMainViewerOptions {
  currentPosition: THREE.Vector3;
  currentTarget: THREE.Vector3;
  currentZoom: number;
  mainAnchor: THREE.Vector3;
  maxZoom?: number;
  minZoom?: number;
  targetZoom?: number | null;
  panDamping?: number;
  zoomRatio?: number;
}

export interface SidePanelCameraFrame {
  direction: THREE.Vector3;
  distance: number;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

export interface SidePanelCameraUpdate {
  position: THREE.Vector3;
  target: THREE.Vector3;
  zoom: number;
}

type SidePanelProjectionCamera = THREE.Camera & {
  near: number;
  far: number;
  updateProjectionMatrix: () => void;
};

const POINT_CLOUD_CROP_NDC_PADDING = 0.86;
const getFiniteControlZoomLimit = (value: unknown, fallback: number) => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

// Any FO3D camera (perspective or orthographic) exposes near/far + projection.
const getProjectionCamera = (camera: THREE.Camera) =>
  camera as SidePanelProjectionCamera;

const getOrthographicCamera = (camera: THREE.Camera) => {
  const maybeOrthographic = camera as THREE.OrthographicCamera & {
    isOrthographicCamera?: boolean;
  };

  return maybeOrthographic.isOrthographicCamera ? maybeOrthographic : null;
};

const getPerspectiveCamera = (camera: THREE.Camera) => {
  const maybePerspective = camera as THREE.PerspectiveCamera & {
    isPerspectiveCamera?: boolean;
  };

  return maybePerspective.isPerspectiveCamera ? maybePerspective : null;
};

export const getCameraVisibleWorldHeightAtPoint = (
  camera: THREE.Camera,
  point: THREE.Vector3,
) => {
  const orthographicCamera = getOrthographicCamera(camera);
  if (orthographicCamera) {
    return (
      (orthographicCamera.top - orthographicCamera.bottom) /
      orthographicCamera.zoom
    );
  }

  const perspectiveCamera = getPerspectiveCamera(camera);
  if (!perspectiveCamera) {
    return null;
  }

  camera.updateMatrixWorld();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const depth = point.clone().sub(camera.position).dot(direction);

  if (!Number.isFinite(depth) || depth <= 0) {
    return null;
  }

  return (
    2 * depth * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2)
  );
};

export const getOrthographicZoomForVisibleWorldHeight = (
  camera: THREE.Camera,
  visibleWorldHeight: number | null | undefined,
  zoomGain = SIDE_PANEL_PERSPECTIVE_ZOOM_GAIN,
) => {
  const orthographicCamera = getOrthographicCamera(camera);

  if (
    !orthographicCamera ||
    typeof visibleWorldHeight !== "number" ||
    !Number.isFinite(visibleWorldHeight) ||
    visibleWorldHeight <= 0
  ) {
    return null;
  }

  const frustumHeight = orthographicCamera.top - orthographicCamera.bottom;
  const zoom = (frustumHeight / visibleWorldHeight) * zoomGain;

  return Number.isFinite(zoom) && zoom > 0 ? zoom : null;
};

export const applyVisibleWorldHeightZoomToOrthographicCamera = ({
  camera,
  controls,
  invalidate,
  visibleWorldHeight,
}: ApplyVisibleWorldHeightZoomOptions) => {
  const orthographicCamera = getOrthographicCamera(camera);
  if (!orthographicCamera) {
    return false;
  }

  const targetZoom = getOrthographicZoomForVisibleWorldHeight(
    camera,
    visibleWorldHeight,
  );
  if (!targetZoom) {
    return false;
  }

  const minZoom = getFiniteControlZoomLimit(
    controls?.minZoom,
    SIDE_PANEL_SYNC_MIN_ZOOM,
  );
  const maxZoom = Math.max(
    minZoom,
    getFiniteControlZoomLimit(controls?.maxZoom, SIDE_PANEL_SYNC_MAX_ZOOM),
  );

  orthographicCamera.zoom = THREE.MathUtils.clamp(targetZoom, minZoom, maxZoom);
  orthographicCamera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  controls?.update?.();
  invalidate?.();

  return true;
};

const getPointCloudCropWorldCorners = (crop: PointCloudCrop) => {
  const corners: THREE.Vector3[] = [];
  const signs = [-1, 1];

  for (const xSign of signs) {
    for (const ySign of signs) {
      for (const zSign of signs) {
        corners.push(
          new THREE.Vector3(
            crop.halfSize.x * xSign,
            crop.halfSize.y * ySign,
            crop.halfSize.z * zSign,
          )
            .applyQuaternion(crop.quaternion)
            .add(crop.center),
        );
      }
    }
  }

  return corners;
};

const resolveSidePanelCameraDistance = ({
  distance,
  sceneBoundingBox,
}: Pick<
  DeriveSidePanelCameraFrameOptions,
  "distance" | "sceneBoundingBox"
>) => {
  if (
    typeof distance === "number" &&
    Number.isFinite(distance) &&
    distance > 0
  ) {
    return distance;
  }

  if (sceneBoundingBox && !sceneBoundingBox.isEmpty()) {
    const size = sceneBoundingBox.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    if (Number.isFinite(maxSize) && maxSize > 0) {
      return maxSize * 2.5;
    }
  }

  return DEFAULT_SIDE_PANEL_CAMERA_DISTANCE;
};

export const getSidePanelViewDirection = (
  viewType: SidePanelViewType,
  upVector: THREE.Vector3,
) => {
  const upDir = upVector.clone().normalize();

  switch (viewType) {
    case VIEW_TYPE_TOP:
      return upDir.clone();
    case VIEW_TYPE_BOTTOM:
      return upDir.clone().negate();
    case VIEW_TYPE_LEFT:
      if (Math.abs(upDir.y) > AXIS_ALIGNMENT_THRESHOLD) {
        return new THREE.Vector3(-1, 0, 0);
      }
      return new THREE.Vector3(0, 1, 0).cross(upDir).normalize().negate();
    case VIEW_TYPE_RIGHT:
      if (Math.abs(upDir.y) > AXIS_ALIGNMENT_THRESHOLD) {
        return new THREE.Vector3(1, 0, 0);
      }
      return new THREE.Vector3(0, 1, 0).cross(upDir).normalize();
    case VIEW_TYPE_FRONT:
      if (Math.abs(upDir.y) > AXIS_ALIGNMENT_THRESHOLD) {
        return new THREE.Vector3(0, 0, 1);
      }
      return upDir
        .clone()
        .cross(new THREE.Vector3(0, -1, 0).cross(upDir).normalize())
        .normalize();
    case VIEW_TYPE_BACK:
      if (Math.abs(upDir.y) > AXIS_ALIGNMENT_THRESHOLD) {
        return new THREE.Vector3(0, 0, -1);
      }
      return upDir
        .clone()
        .cross(new THREE.Vector3(0, 1, 0).cross(upDir).normalize())
        .normalize();
    default:
      return upDir.clone();
  }
};

export const getSidePanelCameraUp = (
  viewType: SidePanelViewType,
  upVector: THREE.Vector3,
) => {
  const upDir = upVector.clone().normalize();

  switch (viewType) {
    case VIEW_TYPE_TOP:
    case VIEW_TYPE_BOTTOM: {
      let candidate: THREE.Vector3;

      if (Math.abs(upDir.y) > AXIS_ALIGNMENT_THRESHOLD) {
        candidate = new THREE.Vector3(0, 0, 1);
      } else if (Math.abs(upDir.z) > AXIS_ALIGNMENT_THRESHOLD) {
        candidate = new THREE.Vector3(0, 1, 0);
      } else if (Math.abs(upDir.x) > AXIS_ALIGNMENT_THRESHOLD) {
        candidate = new THREE.Vector3(0, 1, 0);
      } else {
        const temp = new THREE.Vector3(0, 1, 0);
        if (Math.abs(upDir.dot(temp)) > AXIS_ALIGNMENT_THRESHOLD) {
          temp.set(1, 0, 0);
        }
        candidate = new THREE.Vector3().crossVectors(temp, upDir).normalize();
      }

      const projection = candidate
        .clone()
        .sub(upDir.clone().multiplyScalar(candidate.dot(upDir)))
        .normalize();
      const topUp =
        projection.length() > MIN_DERIVED_UP_LENGTH
          ? projection
          : new THREE.Vector3(0, 0, 1);

      if (viewType === VIEW_TYPE_TOP) {
        return topUp;
      }

      const right = new THREE.Vector3().crossVectors(topUp, upDir).normalize();
      const bottomUp = new THREE.Vector3()
        .crossVectors(right, upDir.clone().negate())
        .normalize();

      return bottomUp.length() > MIN_DERIVED_UP_LENGTH ? bottomUp : topUp;
    }
    case VIEW_TYPE_LEFT:
    case VIEW_TYPE_RIGHT:
    case VIEW_TYPE_FRONT:
    case VIEW_TYPE_BACK:
      return upDir.clone();
    default:
      return upDir.clone();
  }
};

export const deriveSidePanelCameraFrame = ({
  distance,
  sceneBoundingBox,
  target,
  upVector,
  viewType,
}: DeriveSidePanelCameraFrameOptions): SidePanelCameraFrame => {
  const resolvedDistance = resolveSidePanelCameraDistance({
    distance,
    sceneBoundingBox,
  });
  const direction = getSidePanelViewDirection(viewType, upVector);
  const resolvedTarget = target.clone();

  return {
    direction,
    distance: resolvedDistance,
    position: resolvedTarget
      .clone()
      .add(direction.clone().multiplyScalar(resolvedDistance)),
    target: resolvedTarget,
    up: getSidePanelCameraUp(viewType, upVector),
  };
};

export const retargetSidePanelCameraFrame = (
  frame: SidePanelCameraFrame,
  target: THREE.Vector3,
): SidePanelCameraFrame => {
  const resolvedTarget = target.clone();
  const direction = frame.direction.clone().normalize();

  return {
    direction,
    distance: frame.distance,
    position: resolvedTarget
      .clone()
      .add(direction.clone().multiplyScalar(frame.distance)),
    target: resolvedTarget,
    up: frame.up.clone(),
  };
};

const HEADING_PROJECTION_EPSILON = 1e-8;
// A cuboid's heading is its local +X axis.
const CUBOID_HEADING_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Yaw-only ("heading") rotation about the scene up that takes a cuboid at zero
 * yaw to the given orientation. Pitch/roll are intentionally ignored, so the
 * scene up stays vertical. Returns identity when the heading is degenerate
 * (parallel to up) or the box is unrotated.
 */
export const getSidePanelHeadingQuaternion = (
  orientation: THREE.Quaternion,
  upVector: THREE.Vector3,
): THREE.Quaternion => {
  const up = upVector.clone().normalize();
  const projectToGroundPlane = (v: THREE.Vector3) =>
    v.clone().sub(up.clone().multiplyScalar(v.dot(up)));

  // Project both the zero-yaw heading and the box's actual heading onto the
  // ground plane; the rotation between them lies in that plane, i.e. is a pure
  // rotation about up.
  const reference = projectToGroundPlane(CUBOID_HEADING_AXIS);
  const heading = projectToGroundPlane(
    CUBOID_HEADING_AXIS.clone().applyQuaternion(orientation),
  );

  if (
    reference.lengthSq() < HEADING_PROJECTION_EPSILON ||
    heading.lengthSq() < HEADING_PROJECTION_EPSILON
  ) {
    return new THREE.Quaternion();
  }

  return new THREE.Quaternion().setFromUnitVectors(
    reference.normalize(),
    heading.normalize(),
  );
};

/**
 * Rotates a camera frame's orientation by a heading (yaw-about-up) rotation,
 * keeping the same target. Top/bottom views only change their up (direction is
 * parallel to up, so it's unchanged) and side views only change their direction
 * (up is parallel to up) — so the box ends up axis-aligned in every view.
 */
export const applyHeadingToSidePanelCameraFrame = (
  frame: SidePanelCameraFrame,
  headingQuaternion: THREE.Quaternion,
): SidePanelCameraFrame => {
  const direction = frame.direction
    .clone()
    .applyQuaternion(headingQuaternion)
    .normalize();
  const up = frame.up.clone().applyQuaternion(headingQuaternion).normalize();

  return {
    direction,
    distance: frame.distance,
    position: frame.target
      .clone()
      .add(direction.clone().multiplyScalar(frame.distance)),
    target: frame.target.clone(),
    up,
  };
};

export const applySidePanelCameraFrame = ({
  camera,
  controls,
  frame,
  invalidate,
}: ApplySidePanelCameraFrameOptions) => {
  const projectionCamera = getProjectionCamera(camera);

  camera.position.copy(frame.position);
  camera.up.copy(frame.up);
  controls?.target?.copy(frame.target);
  camera.lookAt(frame.target);
  camera.updateMatrixWorld();
  projectionCamera.updateProjectionMatrix();
  controls?.update?.();
  invalidate?.();
};

export const deriveSidePanelCameraUpdateFromMainViewer = ({
  currentPosition,
  currentTarget,
  currentZoom,
  mainAnchor,
  maxZoom = SIDE_PANEL_SYNC_MAX_ZOOM,
  minZoom = SIDE_PANEL_SYNC_MIN_ZOOM,
  panDamping = 1,
  targetZoom,
  zoomRatio,
}: DeriveSidePanelCameraUpdateFromMainViewerOptions): SidePanelCameraUpdate => {
  const clampedDamping = THREE.MathUtils.clamp(panDamping, 0, 1);
  const targetDelta = mainAnchor
    .clone()
    .sub(currentTarget)
    .multiplyScalar(clampedDamping);
  const resolvedMinZoom = Math.max(0, minZoom);
  const resolvedMaxZoom = Math.max(resolvedMinZoom, maxZoom);
  const zoom =
    typeof targetZoom === "number" &&
    Number.isFinite(targetZoom) &&
    targetZoom > 0
      ? THREE.MathUtils.clamp(targetZoom, resolvedMinZoom, resolvedMaxZoom)
      : typeof zoomRatio === "number" &&
          Number.isFinite(zoomRatio) &&
          zoomRatio > 0
        ? THREE.MathUtils.clamp(
            currentZoom * zoomRatio,
            resolvedMinZoom,
            resolvedMaxZoom,
          )
        : currentZoom;

  return {
    position: currentPosition.clone().add(targetDelta),
    target: currentTarget.clone().add(targetDelta),
    zoom,
  };
};

export const doesPointCloudCropFitCamera = (
  crop: PointCloudCrop,
  camera: THREE.Camera,
  padding = POINT_CLOUD_CROP_NDC_PADDING,
) => {
  camera.updateMatrixWorld();
  const cameraWithProjection = camera as THREE.Camera & {
    updateProjectionMatrix?: () => void;
  };
  cameraWithProjection.updateProjectionMatrix?.();

  return getPointCloudCropWorldCorners(crop).every((corner) => {
    const projected = corner.project(camera);
    return (
      Math.abs(projected.x) <= padding &&
      Math.abs(projected.y) <= padding &&
      projected.z >= -1 &&
      projected.z <= 1
    );
  });
};

export const getOrbitControlsWheelZoomRatio = (
  deltaY: number,
  zoomSpeed = MAIN_PANEL_ORBIT_ZOOM_SPEED,
) => {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return null;
  }

  const zoomScale = Math.pow(ORBIT_CONTROLS_WHEEL_ZOOM_BASE, zoomSpeed);

  return deltaY < 0 ? 1 / zoomScale : zoomScale;
};

export const createMainPanelZoomSyncIntent = ({
  activeCursorPanel,
  camera,
  deltaY,
  id,
  raycastResult,
  timestamp,
  zoomSpeed,
}: CreateMainPanelZoomSyncIntentOptions): MainPanelZoomSyncIntent | null => {
  if (
    activeCursorPanel !== PANEL_ID_MAIN ||
    raycastResult.sourcePanel !== PANEL_ID_MAIN ||
    !raycastResult.worldPosition
  ) {
    return null;
  }

  const zoomRatio = getOrbitControlsWheelZoomRatio(deltaY, zoomSpeed);
  if (!zoomRatio) {
    return null;
  }

  const anchor = new THREE.Vector3(...raycastResult.worldPosition);

  return {
    id,
    anchor: raycastResult.worldPosition,
    zoomRatio,
    visibleWorldHeightAtAnchor:
      (camera && getCameraVisibleWorldHeightAtPoint(camera, anchor)) ??
      raycastResult.visibleWorldHeightAtPoint,
    timestamp,
  };
};

export const createMainPanelPanSyncIntent = ({
  id,
  isMainPanelPointerDrag,
  raycastResult,
  timestamp,
}: CreateMainPanelPanSyncIntentOptions): MainPanelPanSyncIntent | null => {
  if (
    !isMainPanelPointerDrag ||
    raycastResult.sourcePanel !== PANEL_ID_MAIN ||
    !raycastResult.worldPosition
  ) {
    return null;
  }

  return {
    id,
    anchor: raycastResult.worldPosition,
    timestamp,
  };
};

export const shouldApplyMainPanelNavigationSyncIntent = ({
  activeCrop,
  intent,
  maxAgeMs = MAIN_PANEL_ZOOM_SYNC_MAX_AGE_MS,
  now,
}: ShouldApplyMainPanelNavigationSyncIntentOptions) => {
  if (now - intent.timestamp > maxAgeMs) {
    return false;
  }

  if (!activeCrop) {
    return true;
  }

  if (activeCrop.source === "creation") {
    return false;
  }

  const isAnchorInsideCrop = isPointInsidePointCloudCrop(
    new THREE.Vector3(...intent.anchor),
    activeCrop,
  );

  return isAnchorInsideCrop;
};

export const shouldApplyMainPanelPanSyncIntent = (
  options: Omit<ShouldApplyMainPanelNavigationSyncIntentOptions, "maxAgeMs"> & {
    maxAgeMs?: number;
  },
) => {
  return shouldApplyMainPanelNavigationSyncIntent({
    ...options,
    maxAgeMs: options.maxAgeMs ?? MAIN_PANEL_PAN_SYNC_MAX_AGE_MS,
  });
};

const applyMainPanelZoomSyncToOrthographicCamera = ({
  anchor,
  camera,
  controls,
  invalidate,
  visibleWorldHeightAtAnchor,
  zoomRatio,
}: ApplyMainPanelZoomSyncOptions) => {
  const orthographicCamera = getOrthographicCamera(camera);

  if (!orthographicCamera || !Number.isFinite(zoomRatio) || zoomRatio <= 0) {
    return false;
  }

  const minZoom = getFiniteControlZoomLimit(
    controls?.minZoom,
    SIDE_PANEL_SYNC_MIN_ZOOM,
  );
  const maxZoom = Math.max(
    minZoom,
    getFiniteControlZoomLimit(controls?.maxZoom, SIDE_PANEL_SYNC_MAX_ZOOM),
  );
  const targetZoom = getOrthographicZoomForVisibleWorldHeight(
    camera,
    visibleWorldHeightAtAnchor,
  );
  const nextZoom = THREE.MathUtils.clamp(
    targetZoom ?? orthographicCamera.zoom * zoomRatio,
    minZoom,
    maxZoom,
  );
  const update = controls?.target
    ? deriveSidePanelCameraUpdateFromMainViewer({
        currentPosition: camera.position,
        currentTarget: controls.target,
        currentZoom: orthographicCamera.zoom,
        mainAnchor: anchor,
        maxZoom,
        minZoom,
        targetZoom,
        zoomRatio,
      })
    : null;

  if (update) {
    camera.position.copy(update.position);
    controls?.target?.copy(update.target);
    orthographicCamera.zoom = update.zoom;
  } else {
    orthographicCamera.zoom = nextZoom;
  }

  orthographicCamera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  controls?.update?.();
  invalidate?.();

  return true;
};

export const applyMainPanelZoomSyncIntentToOrthographicCamera = ({
  camera,
  controls,
  intent,
  invalidate,
}: ApplyMainPanelZoomSyncIntentOptions) => {
  return applyMainPanelZoomSyncToOrthographicCamera({
    anchor: new THREE.Vector3(...intent.anchor),
    camera,
    controls,
    invalidate,
    visibleWorldHeightAtAnchor: intent.visibleWorldHeightAtAnchor,
    zoomRatio: intent.zoomRatio,
  });
};

export const applyPointCloudCropMainPanelSyncToOrthographicCamera = ({
  camera,
  controls,
  crop,
  invalidate,
}: ApplyPointCloudCropMainPanelSyncOptions) => {
  const visibleWorldHeight = crop.visibleWorldHeightAtCenter;

  if (
    !controls?.target ||
    typeof visibleWorldHeight !== "number" ||
    !Number.isFinite(visibleWorldHeight) ||
    visibleWorldHeight <= 0
  ) {
    return false;
  }

  return applyMainPanelZoomSyncToOrthographicCamera({
    anchor: crop.center,
    camera,
    controls,
    invalidate,
    visibleWorldHeightAtAnchor: visibleWorldHeight,
    zoomRatio: 1,
  });
};

export const applyMainPanelPanSyncIntentToOrthographicCamera = ({
  camera,
  controls,
  damping = SIDE_PANEL_PAN_SYNC_DAMPING,
  intent,
  invalidate,
}: ApplyMainPanelPanSyncIntentOptions) => {
  const orthographicCamera = getOrthographicCamera(camera);
  if (!orthographicCamera || !controls?.target) {
    return false;
  }
  const update = deriveSidePanelCameraUpdateFromMainViewer({
    currentPosition: camera.position,
    currentTarget: controls.target,
    currentZoom: orthographicCamera.zoom,
    mainAnchor: new THREE.Vector3(...intent.anchor),
    panDamping: damping,
  });

  camera.position.copy(update.position);
  controls.target.copy(update.target);
  camera.updateMatrixWorld();
  controls?.update?.();
  invalidate?.();

  return true;
};
