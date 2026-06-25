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

export const MAIN_PANEL_ORBIT_ZOOM_SPEED = 0.6;
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
  hasHoverFocus?: boolean;
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

export interface SidePanelCameraSnapshot {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  up: THREE.Vector3;
  zoom?: number;
  near: number;
  far: number;
  controlsTarget?: THREE.Vector3;
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

const isOrthographicCamera = (camera: THREE.Camera) => {
  return Boolean(
    (camera as THREE.OrthographicCamera & { isOrthographicCamera?: boolean })
      .isOrthographicCamera
  );
};

const getProjectionCamera = (camera: THREE.Camera) =>
  camera as SidePanelProjectionCamera;

const getOrthographicCamera = (camera: THREE.Camera) => {
  const maybeOrthographic = getProjectionCamera(
    camera
  ) as THREE.OrthographicCamera & {
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
  point: THREE.Vector3
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
  zoomGain = SIDE_PANEL_PERSPECTIVE_ZOOM_GAIN
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
    visibleWorldHeight
  );
  if (!targetZoom) {
    return false;
  }

  const minZoom = getFiniteControlZoomLimit(
    controls?.minZoom,
    SIDE_PANEL_SYNC_MIN_ZOOM
  );
  const maxZoom = Math.max(
    minZoom,
    getFiniteControlZoomLimit(controls?.maxZoom, SIDE_PANEL_SYNC_MAX_ZOOM)
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
            crop.halfSize.z * zSign
          )
            .applyQuaternion(crop.quaternion)
            .add(crop.center)
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
  upVector: THREE.Vector3
) => {
  const upDir = upVector.clone().normalize();

  switch (viewType) {
    case VIEW_TYPE_TOP:
      return upDir.clone();
    case VIEW_TYPE_BOTTOM:
      return upDir.clone().negate();
    case VIEW_TYPE_LEFT:
      if (Math.abs(upDir.y) > 0.9) {
        return new THREE.Vector3(-1, 0, 0);
      }
      return new THREE.Vector3(0, 1, 0).cross(upDir).normalize().negate();
    case VIEW_TYPE_RIGHT:
      if (Math.abs(upDir.y) > 0.9) {
        return new THREE.Vector3(1, 0, 0);
      }
      return new THREE.Vector3(0, 1, 0).cross(upDir).normalize();
    case VIEW_TYPE_FRONT:
      if (Math.abs(upDir.y) > 0.9) {
        return new THREE.Vector3(0, 0, 1);
      }
      return upDir
        .clone()
        .cross(new THREE.Vector3(0, -1, 0).cross(upDir).normalize())
        .normalize();
    case VIEW_TYPE_BACK:
      if (Math.abs(upDir.y) > 0.9) {
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
  upVector: THREE.Vector3
) => {
  const upDir = upVector.clone().normalize();

  switch (viewType) {
    case VIEW_TYPE_TOP:
    case VIEW_TYPE_BOTTOM: {
      let candidate: THREE.Vector3;

      if (Math.abs(upDir.y) > 0.9) {
        candidate = new THREE.Vector3(0, 0, 1);
      } else if (Math.abs(upDir.z) > 0.9) {
        candidate = new THREE.Vector3(0, 1, 0);
      } else if (Math.abs(upDir.x) > 0.9) {
        candidate = new THREE.Vector3(0, 1, 0);
      } else {
        const temp = new THREE.Vector3(0, 1, 0);
        if (Math.abs(upDir.dot(temp)) > 0.9) {
          temp.set(1, 0, 0);
        }
        candidate = new THREE.Vector3().crossVectors(temp, upDir).normalize();
      }

      const projection = candidate
        .clone()
        .sub(upDir.clone().multiplyScalar(candidate.dot(upDir)))
        .normalize();
      const topUp =
        projection.length() > 0.1 ? projection : new THREE.Vector3(0, 0, 1);

      if (viewType === VIEW_TYPE_TOP) {
        return topUp;
      }

      const right = new THREE.Vector3().crossVectors(topUp, upDir).normalize();
      const bottomUp = new THREE.Vector3()
        .crossVectors(right, upDir.clone().negate())
        .normalize();

      return bottomUp.length() > 0.1 ? bottomUp : topUp;
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
  target: THREE.Vector3
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
          resolvedMaxZoom
        )
      : currentZoom;

  return {
    position: currentPosition.clone().add(targetDelta),
    target: currentTarget.clone().add(targetDelta),
    zoom,
  };
};

export const captureSidePanelCameraSnapshot = (
  camera: THREE.Camera,
  controls?: SidePanelControls
): SidePanelCameraSnapshot => {
  const projectionCamera = getProjectionCamera(camera);
  const orthographicCamera = getOrthographicCamera(camera);

  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    up: camera.up.clone(),
    zoom: orthographicCamera?.zoom,
    near: projectionCamera.near,
    far: projectionCamera.far,
    controlsTarget: controls?.target?.clone(),
  };
};

export const restoreSidePanelCameraSnapshot = ({
  camera,
  controls,
  invalidate,
  snapshot,
}: {
  camera: THREE.Camera;
  controls?: SidePanelControls;
  invalidate?: () => void;
  snapshot: SidePanelCameraSnapshot;
}) => {
  const projectionCamera = getProjectionCamera(camera);

  camera.position.copy(snapshot.position);
  camera.quaternion.copy(snapshot.quaternion);
  camera.up.copy(snapshot.up);
  projectionCamera.near = snapshot.near;
  projectionCamera.far = snapshot.far;

  const orthographicCamera = getOrthographicCamera(camera);
  if (orthographicCamera && snapshot.zoom !== undefined) {
    orthographicCamera.zoom = snapshot.zoom;
  }

  camera.updateMatrixWorld();
  projectionCamera.updateProjectionMatrix();

  if (controls?.target && snapshot.controlsTarget) {
    controls.target.copy(snapshot.controlsTarget);
    controls.update?.();
  }

  invalidate?.();
};

export const doesPointCloudCropFitCamera = (
  crop: PointCloudCrop,
  camera: THREE.Camera,
  padding = POINT_CLOUD_CROP_NDC_PADDING
) => {
  camera.updateMatrixWorld();
  const cameraWithProjection = camera as THREE.Camera & {
    updateProjectionMatrix?: () => void;
  };
  cameraWithProjection.updateProjectionMatrix?.();

  return getPointCloudCropWorldCorners(crop).every((corner) => {
    const projected = corner.project(camera);
    return Math.abs(projected.x) <= padding && Math.abs(projected.y) <= padding;
  });
};

export const getOrbitControlsWheelZoomRatio = (
  deltaY: number,
  zoomSpeed = MAIN_PANEL_ORBIT_ZOOM_SPEED
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
  hasHoverFocus = false,
  intent,
  maxAgeMs = MAIN_PANEL_ZOOM_SYNC_MAX_AGE_MS,
  now,
}: ShouldApplyMainPanelNavigationSyncIntentOptions) => {
  if (now - intent.timestamp > maxAgeMs) {
    return false;
  }

  if (hasHoverFocus) {
    return false;
  }

  if (!activeCrop) {
    return true;
  }

  if (activeCrop.source === "creation" || activeCrop.source === "hover") {
    return false;
  }

  return isPointInsidePointCloudCrop(
    new THREE.Vector3(...intent.anchor),
    activeCrop
  );
};

export const shouldApplyMainPanelZoomSyncIntent =
  shouldApplyMainPanelNavigationSyncIntent;

export const shouldApplyMainPanelPanSyncIntent = (
  options: Omit<ShouldApplyMainPanelNavigationSyncIntentOptions, "maxAgeMs"> & {
    maxAgeMs?: number;
  }
) => {
  return shouldApplyMainPanelNavigationSyncIntent({
    ...options,
    maxAgeMs: options.maxAgeMs ?? MAIN_PANEL_PAN_SYNC_MAX_AGE_MS,
  });
};

export const applyMainPanelZoomSyncIntentToOrthographicCamera = ({
  camera,
  controls,
  intent,
  invalidate,
}: ApplyMainPanelZoomSyncIntentOptions) => {
  const orthographicCamera = camera as THREE.OrthographicCamera & {
    isOrthographicCamera?: boolean;
  };

  if (
    !isOrthographicCamera(camera) ||
    !Number.isFinite(intent.zoomRatio) ||
    intent.zoomRatio <= 0
  ) {
    return false;
  }

  const minZoom = getFiniteControlZoomLimit(
    controls?.minZoom,
    SIDE_PANEL_SYNC_MIN_ZOOM
  );
  const maxZoom = Math.max(
    minZoom,
    getFiniteControlZoomLimit(controls?.maxZoom, SIDE_PANEL_SYNC_MAX_ZOOM)
  );
  const targetZoom = getOrthographicZoomForVisibleWorldHeight(
    camera,
    intent.visibleWorldHeightAtAnchor
  );
  const nextZoom = THREE.MathUtils.clamp(
    targetZoom ?? orthographicCamera.zoom * intent.zoomRatio,
    minZoom,
    maxZoom
  );
  const update = controls?.target
    ? deriveSidePanelCameraUpdateFromMainViewer({
        currentPosition: camera.position,
        currentTarget: controls.target,
        currentZoom: orthographicCamera.zoom,
        mainAnchor: new THREE.Vector3(...intent.anchor),
        maxZoom,
        minZoom,
        targetZoom,
        zoomRatio: intent.zoomRatio,
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

export const applyMainPanelPanSyncIntentToOrthographicCamera = ({
  camera,
  controls,
  damping = SIDE_PANEL_PAN_SYNC_DAMPING,
  intent,
  invalidate,
}: ApplyMainPanelPanSyncIntentOptions) => {
  if (!isOrthographicCamera(camera) || !controls?.target) {
    return false;
  }

  const orthographicCamera = camera as THREE.OrthographicCamera;
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
