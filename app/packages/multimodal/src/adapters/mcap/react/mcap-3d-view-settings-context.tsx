import React, { createContext, useContext, useMemo } from "react";

import type { Mcap3dSceneUpAxis } from "./mcap-3d-scene-up";

interface Mcap3dViewSettingsContextValue {
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly setSceneUpAxis: (axis: Mcap3dSceneUpAxis) => void;
}

const Mcap3dViewSettingsContext =
  createContext<Mcap3dViewSettingsContextValue | null>(null);

export const Mcap3dViewSettingsProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly setSceneUpAxis: (axis: Mcap3dSceneUpAxis) => void;
}> = ({ children, sceneUpAxis, setSceneUpAxis }) => {
  const value = useMemo(
    () => ({ sceneUpAxis, setSceneUpAxis }),
    [sceneUpAxis, setSceneUpAxis],
  );

  return (
    <Mcap3dViewSettingsContext.Provider value={value}>
      {children}
    </Mcap3dViewSettingsContext.Provider>
  );
};

export function useMcap3dViewSettings(): Mcap3dViewSettingsContextValue {
  const value = useContext(Mcap3dViewSettingsContext);
  if (!value) {
    throw new Error(
      "useMcap3dViewSettings must be used inside <Mcap3dViewSettingsProvider>",
    );
  }
  return value;
}
