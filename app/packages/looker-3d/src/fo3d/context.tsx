import { createContext, useContext } from "react";
import type { Box3, Vector3 } from "three";
import type { Looker3dSettings } from "../settings";

interface Fo3dContextT {
  isSceneInitialized: boolean;
  upVector: Vector3 | null;
  setUpVector: (upVector: Vector3) => void;
  sceneBoundingBox: Box3 | null;
  pluginSettings: Looker3dSettings | null;
  fo3dRoot: string | null;
}

const defaultContext: Fo3dContextT = {
  isSceneInitialized: false,
  upVector: null,
  setUpVector: () => {},
  sceneBoundingBox: null,
  pluginSettings: null,
  fo3dRoot: null,
};

export const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const useFo3dContext = () => {
  return useContext(Fo3dSceneContext);
};
