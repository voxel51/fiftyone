import React, { createContext, useContext, useMemo } from "react";

import type { Scene3dUpAxis, Scene3dTrackingMode } from "./view-preferences";

interface Scene3dViewSettingsContextValue {
  readonly defaultTrackingMode: Scene3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly setDefaultTrackingMode: (mode: Scene3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string | null) => void;
  readonly setSceneUpAxis: (axis: Scene3dUpAxis) => void;
}

const Scene3dViewSettingsContext =
  createContext<Scene3dViewSettingsContextValue | null>(null);

/** Supplies scene-wide 3D view preferences and their persistence callbacks. */
export const Scene3dViewSettingsProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly defaultTrackingMode: Scene3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly setDefaultTrackingMode: (mode: Scene3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string | null) => void;
  readonly setSceneUpAxis: (axis: Scene3dUpAxis) => void;
}> = ({
  children,
  defaultTrackingMode,
  preferredCameraTargetFrameId,
  preferredWorldFrameId,
  sceneUpAxis,
  setDefaultTrackingMode,
  setPreferredCameraTargetFrameId,
  setPreferredWorldFrameId,
  setSceneUpAxis,
}) => {
  const value = useMemo(
    () => ({
      defaultTrackingMode,
      preferredCameraTargetFrameId,
      preferredWorldFrameId,
      sceneUpAxis,
      setDefaultTrackingMode,
      setPreferredCameraTargetFrameId,
      setPreferredWorldFrameId,
      setSceneUpAxis,
    }),
    [
      defaultTrackingMode,
      preferredCameraTargetFrameId,
      preferredWorldFrameId,
      sceneUpAxis,
      setDefaultTrackingMode,
      setPreferredCameraTargetFrameId,
      setPreferredWorldFrameId,
      setSceneUpAxis,
    ],
  );

  return (
    <Scene3dViewSettingsContext.Provider value={value}>
      {children}
    </Scene3dViewSettingsContext.Provider>
  );
};

/** Reads the required scene-wide 3D view settings. */
export function useScene3dViewSettings(): Scene3dViewSettingsContextValue {
  const value = useContext(Scene3dViewSettingsContext);
  if (!value) {
    throw new Error(
      "useScene3dViewSettings must be used inside <Scene3dViewSettingsProvider>",
    );
  }
  return value;
}

/**
 * Provider-tolerant read for modal chrome that renders with or without a
 * playback host (tests, isolated sidebars). Null means no scene exists to
 * orient, and callers should omit their scene-orientation controls.
 */
export function useOptionalScene3dViewSettings(): Scene3dViewSettingsContextValue | null {
  return useContext(Scene3dViewSettingsContext);
}
