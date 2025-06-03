import { createContext, useContext } from "react";
import type { Box3, Vector3 } from "three";
import type { Looker3dSettings } from "../settings";

export interface Fo3dPointCloudSettings {
  enableTooltip: boolean;
  rayCastingSensitivity: "high" | "medium" | "low" | string;
}

interface Fo3dContextT {
  isSceneInitialized: boolean;
  upVector: Vector3 | null;
  setUpVector: (upVector: Vector3) => void;
  sceneBoundingBox: Box3 | null;
  pluginSettings: Looker3dSettings | null;
  fo3dRoot: string | null;
  autoRotate: boolean;
  setAutoRotate: (autoRotate: boolean) => void;
  pointCloudSettings: Fo3dPointCloudSettings;
  setPointCloudSettings: (pointCloudSettings: Fo3dPointCloudSettings) => void;
  hoverMetadata: Record<string, unknown> | null;
  setHoverMetadata: (hoverMetadata: Record<string, unknown>) => void;
}

const defaultContext: Fo3dContextT = {
  isSceneInitialized: false,
  upVector: null,
  setUpVector: () => {},
  sceneBoundingBox: null,
  pluginSettings: null,
  fo3dRoot: null,
  autoRotate: false,
  setAutoRotate: () => {},
  pointCloudSettings: {
    enableTooltip: false,
    rayCastingSensitivity: "high",
  },
  setPointCloudSettings: () => {},
  hoverMetadata: null,
  setHoverMetadata: () => {},
};

export const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const useFo3dContext = () => {
  return useContext(Fo3dSceneContext);
};
