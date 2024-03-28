import { createContext, useContext } from "react";
import { Box3, Vector3 } from "three";
import { Looker3dPluginSettings } from "../Looker3dPlugin";

interface Fo3dContextT {
  isSceneInitialized: boolean;
  upVector: Vector3 | null;
  sceneBoundingBox: Box3 | null;
  pluginSettings: Looker3dPluginSettings | null;
}

const defaultContext: Fo3dContextT = {
  isSceneInitialized: false,
  upVector: null,
  sceneBoundingBox: null,
  pluginSettings: null,
};

export const Fo3dSceneContext = createContext<Fo3dContextT>(defaultContext);

export const useFo3dContext = () => {
  return useContext(Fo3dSceneContext);
};
