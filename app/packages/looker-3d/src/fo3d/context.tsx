import { createContext, Dispatch, SetStateAction, useContext } from "react";
import type { Box3, Vector3 } from "three";
import type { Looker3dSettings } from "../settings";
import { HoverMetadata } from "../types";

export interface Fo3dPointCloudSettings {
  enableTooltip: boolean;
}

/**
 * Default raycast precision (1-10 scale).
 * Higher values = more precise (smaller hit area).
 */
export const DEFAULT_RAYCAST_PRECISION = 5;

interface Fo3dContextT {
  isSceneInitialized: boolean;
  numPrimaryAssets: number;
  upVector: Vector3 | null;
  setUpVector: (upVector: Vector3) => void;
  isComputingSceneBoundingBox: boolean;
  sceneBoundingBox: Box3 | null;
  cursorBounds: Box3 | null;
  lookAt: Vector3 | null;
  setLookAt: (lookAt: Vector3) => void;
  pluginSettings: Looker3dSettings | null;
  fo3dRoot: string | null;
  autoRotate: boolean;
  setAutoRotate: (autoRotate: boolean) => void;
  pointCloudSettings: Fo3dPointCloudSettings;
  setPointCloudSettings: (pointCloudSettings: Fo3dPointCloudSettings) => void;
  raycastPrecision: number;
  setRaycastPrecision: (precision: number) => void;
  hoverMetadata: HoverMetadata | null;
  setHoverMetadata: Dispatch<SetStateAction<HoverMetadata | null>>;
}

const defaultContext: Fo3dContextT = {
  isSceneInitialized: false,
  numPrimaryAssets: 0,
  upVector: null,
  setUpVector: () => {},
  isComputingSceneBoundingBox: false,
  sceneBoundingBox: null,
  cursorBounds: null,
  lookAt: null,
  setLookAt: () => {},
  pluginSettings: null,
  fo3dRoot: null,
  autoRotate: false,
  setAutoRotate: () => {},
  pointCloudSettings: {
    enableTooltip: false,
  },
  setPointCloudSettings: () => {},
  raycastPrecision: DEFAULT_RAYCAST_PRECISION,
  setRaycastPrecision: () => {},
  hoverMetadata: null,
  setHoverMetadata: () => {},
};

export const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const useFo3dContext = () => {
  return useContext(Fo3dSceneContext);
};
