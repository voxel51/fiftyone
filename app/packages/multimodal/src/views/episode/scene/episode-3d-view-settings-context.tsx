import React, { createContext, useContext, useMemo } from "react";

import type { Episode3dSceneUpAxis } from "./episode-3d-scene-up";
import type { Episode3dTrackingMode } from "./episode-3d-camera";

interface Episode3dViewSettingsContextValue {
  readonly defaultTrackingMode: Episode3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Episode3dSceneUpAxis;
  readonly setDefaultTrackingMode: (mode: Episode3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string | null) => void;
  readonly setSceneUpAxis: (axis: Episode3dSceneUpAxis) => void;
}

const Episode3dViewSettingsContext =
  createContext<Episode3dViewSettingsContextValue | null>(null);

/** Supplies scene-wide 3D view preferences and their persistence callbacks. */
export const Episode3dViewSettingsProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly defaultTrackingMode: Episode3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Episode3dSceneUpAxis;
  readonly setDefaultTrackingMode: (mode: Episode3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string | null) => void;
  readonly setSceneUpAxis: (axis: Episode3dSceneUpAxis) => void;
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
    <Episode3dViewSettingsContext.Provider value={value}>
      {children}
    </Episode3dViewSettingsContext.Provider>
  );
};

/** Reads the required scene-wide 3D view settings. */
export function useEpisode3dViewSettings(): Episode3dViewSettingsContextValue {
  const value = useContext(Episode3dViewSettingsContext);
  if (!value) {
    throw new Error(
      "useEpisode3dViewSettings must be used inside <Episode3dViewSettingsProvider>",
    );
  }
  return value;
}

/**
 * Provider-tolerant read for modal chrome that renders with or without a
 * playback host (tests, isolated sidebars). Null means no scene exists to
 * orient, and callers should omit their scene-orientation controls.
 */
export function useOptionalEpisode3dViewSettings(): Episode3dViewSettingsContextValue | null {
  return useContext(Episode3dViewSettingsContext);
}
