import { Box3, MathUtils, Vector3 } from "three";
import {
  MAIN_PANEL_ORBIT_ZOOM_SPEED,
  ORBIT_CONTROLS_WHEEL_ZOOM_BASE,
} from "./side-panel-camera-sync";

export const MAIN_PANEL_ORBIT_PAN_SPEED = 1.15;
export const MAIN_PANEL_CLOSE_NAVIGATION_DISTANCE_RATIO = 0.03;
export const MAIN_PANEL_CLOSE_NAVIGATION_MIN_DISTANCE = 0.1;
export const MAIN_PANEL_CLOSE_NAVIGATION_MAX_DISTANCE = 3;
export const MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED = 32;
export const MAIN_PANEL_CLOSE_PAN_MAX_SPEED = 4;
export const MAIN_PANEL_CAMERA_TARGET_EPSILON = 1e-4;

const MAX_CLOSE_ZOOM_RADIUS_DELTA_RATIO = 0.95;
const sceneSize = new Vector3();

type MainPanelOrbitControls = {
  getDistance?: () => number;
  minDistance: number;
  panSpeed: number;
  zoomSpeed: number;
};

type GetMainPanelOrbitSpeedOptions = {
  distance: number;
  sceneBoundingBox?: Box3 | null;
};

type GetMainPanelOrbitZoomSpeedOptions = GetMainPanelOrbitSpeedOptions & {
  baseZoomSpeed?: number;
  maxZoomSpeed?: number;
};

type GetMainPanelOrbitPanSpeedOptions = GetMainPanelOrbitSpeedOptions & {
  basePanSpeed?: number;
  maxPanSpeed?: number;
};

type SyncMainPanelOrbitControlsOptions = {
  controls: MainPanelOrbitControls;
  sceneBoundingBox?: Box3 | null;
};

const getPositiveSpeed = (value: number, fallback: number) => {
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const getMainPanelCloseNavigationDistance = (
  sceneBoundingBox?: Box3 | null,
) => {
  if (!sceneBoundingBox || sceneBoundingBox.isEmpty()) {
    return MAIN_PANEL_CLOSE_NAVIGATION_MIN_DISTANCE;
  }

  const diagonal = sceneBoundingBox.getSize(sceneSize).length();
  if (!Number.isFinite(diagonal) || diagonal <= 0) {
    return MAIN_PANEL_CLOSE_NAVIGATION_MIN_DISTANCE;
  }

  return MathUtils.clamp(
    diagonal * MAIN_PANEL_CLOSE_NAVIGATION_DISTANCE_RATIO,
    MAIN_PANEL_CLOSE_NAVIGATION_MIN_DISTANCE,
    MAIN_PANEL_CLOSE_NAVIGATION_MAX_DISTANCE,
  );
};

export const getMainPanelOrbitZoomSpeed = ({
  baseZoomSpeed = MAIN_PANEL_ORBIT_ZOOM_SPEED,
  distance,
  maxZoomSpeed = MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED,
  sceneBoundingBox,
}: GetMainPanelOrbitZoomSpeedOptions) => {
  const baseSpeed = getPositiveSpeed(
    baseZoomSpeed,
    MAIN_PANEL_ORBIT_ZOOM_SPEED,
  );
  const maxSpeed = Math.max(
    baseSpeed,
    getPositiveSpeed(maxZoomSpeed, MAIN_PANEL_CLOSE_ZOOM_MAX_SPEED),
  );

  if (!Number.isFinite(distance) || distance <= 0) {
    return baseSpeed;
  }

  const closeNavigationDistance =
    getMainPanelCloseNavigationDistance(sceneBoundingBox);
  if (distance >= closeNavigationDistance) {
    return baseSpeed;
  }

  if (distance <= MAIN_PANEL_CAMERA_TARGET_EPSILON) {
    return maxSpeed;
  }

  const baseRadiusRatio = Math.pow(ORBIT_CONTROLS_WHEEL_ZOOM_BASE, baseSpeed);
  const targetRadiusDelta = closeNavigationDistance * (1 - baseRadiusRatio);
  const radiusDelta = Math.min(
    targetRadiusDelta,
    distance - MAIN_PANEL_CAMERA_TARGET_EPSILON,
  );
  const radiusDeltaRatio = MathUtils.clamp(
    radiusDelta / distance,
    0,
    MAX_CLOSE_ZOOM_RADIUS_DELTA_RATIO,
  );

  if (radiusDeltaRatio <= 0) {
    return baseSpeed;
  }

  return MathUtils.clamp(
    Math.log(1 - radiusDeltaRatio) / Math.log(ORBIT_CONTROLS_WHEEL_ZOOM_BASE),
    baseSpeed,
    maxSpeed,
  );
};

export const getMainPanelOrbitPanSpeed = ({
  basePanSpeed = MAIN_PANEL_ORBIT_PAN_SPEED,
  distance,
  maxPanSpeed = MAIN_PANEL_CLOSE_PAN_MAX_SPEED,
  sceneBoundingBox,
}: GetMainPanelOrbitPanSpeedOptions) => {
  const baseSpeed = getPositiveSpeed(basePanSpeed, MAIN_PANEL_ORBIT_PAN_SPEED);
  const maxSpeed = Math.max(
    baseSpeed,
    getPositiveSpeed(maxPanSpeed, MAIN_PANEL_CLOSE_PAN_MAX_SPEED),
  );

  if (!Number.isFinite(distance) || distance <= 0) {
    return baseSpeed;
  }

  const closeNavigationDistance =
    getMainPanelCloseNavigationDistance(sceneBoundingBox);
  if (distance >= closeNavigationDistance) {
    return baseSpeed;
  }

  if (distance <= MAIN_PANEL_CAMERA_TARGET_EPSILON) {
    return maxSpeed;
  }

  return MathUtils.clamp(
    baseSpeed * Math.sqrt(closeNavigationDistance / distance),
    baseSpeed,
    maxSpeed,
  );
};

export const syncMainPanelOrbitControls = ({
  controls,
  sceneBoundingBox,
}: SyncMainPanelOrbitControlsOptions) => {
  const distance = controls.getDistance?.() ?? Infinity;

  controls.minDistance = Math.max(
    controls.minDistance ?? 0,
    MAIN_PANEL_CAMERA_TARGET_EPSILON,
  );
  controls.zoomSpeed = getMainPanelOrbitZoomSpeed({
    distance,
    sceneBoundingBox,
  });
  controls.panSpeed = getMainPanelOrbitPanSpeed({
    distance,
    sceneBoundingBox,
  });
};
