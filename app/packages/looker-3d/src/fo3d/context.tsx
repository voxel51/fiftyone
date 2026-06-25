import { createContext, Dispatch, SetStateAction, useContext } from "react";
import type { Box3, LoadingManager, Vector3 } from "three";
import { DEFAULT_SELECTED_CUBOID_CROP_MARGIN } from "../constants";
import type { Looker3dSettings } from "../settings";
import { HoverMetadata } from "../types";
import {
  FO3D_CAMERA_LIFECYCLE,
  type Fo3dCameraLifecycleState,
} from "./camera-lifecycle";

export interface Fo3dPointCloudSettings {
  enableTooltip: boolean;
  selectedCuboidCropMargin: number;
}

interface Fo3dContextT {
  cameraLifecycleState: Fo3dCameraLifecycleState;
  isSceneInitialized: boolean;
  numPrimaryAssets: number;
  upVector: Vector3 | null;
  setUpVector: (upVector: Vector3) => void;
  isComputingSceneBoundingBox: boolean;
  sceneBoundingBox: Box3 | null;
  cursorBounds: Box3 | null;
  lookAt: Vector3 | null;
  pluginSettings: Looker3dSettings | null;
  fo3dRoot: string | null;
  loadingManager: LoadingManager | null;
  autoRotate: boolean;
  setAutoRotate: (autoRotate: boolean) => void;
  pointCloudSettings: Fo3dPointCloudSettings;
  setPointCloudSettings: (pointCloudSettings: Fo3dPointCloudSettings) => void;
  hoverMetadata: HoverMetadata | null;
  setHoverMetadata: Dispatch<SetStateAction<HoverMetadata | null>>;
}

const defaultContext: Fo3dContextT = {
  cameraLifecycleState: FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE,
  isSceneInitialized: false,
  numPrimaryAssets: 0,
  upVector: null,
  setUpVector: () => {},
  isComputingSceneBoundingBox: false,
  sceneBoundingBox: null,
  cursorBounds: null,
  lookAt: null,
  pluginSettings: null,
  fo3dRoot: null,
  loadingManager: null,
  autoRotate: false,
  setAutoRotate: () => {},
  pointCloudSettings: {
    enableTooltip: false,
    selectedCuboidCropMargin: DEFAULT_SELECTED_CUBOID_CROP_MARGIN,
  },
  setPointCloudSettings: () => {},
  hoverMetadata: null,
  setHoverMetadata: () => {},
};

export const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const useFo3dContext = () => {
  return useContext(Fo3dSceneContext);
};
