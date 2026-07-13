import React, { createContext, useContext, useMemo } from "react";

import type { Mcap3dSceneUpAxis } from "./mcap-3d-scene-up";
import type { Mcap3dTrackingMode } from "./mcap-3d-camera";

interface Mcap3dViewSettingsContextValue {
  readonly defaultTrackingMode: Mcap3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly setDefaultTrackingMode: (mode: Mcap3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string) => void;
  readonly setSceneUpAxis: (axis: Mcap3dSceneUpAxis) => void;
}

const Mcap3dViewSettingsContext =
  createContext<Mcap3dViewSettingsContextValue | null>(null);

export const Mcap3dViewSettingsProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly defaultTrackingMode: Mcap3dTrackingMode;
  readonly preferredCameraTargetFrameId: string | null;
  readonly preferredWorldFrameId: string | null;
  readonly sceneUpAxis: Mcap3dSceneUpAxis;
  readonly setDefaultTrackingMode: (mode: Mcap3dTrackingMode) => void;
  readonly setPreferredCameraTargetFrameId: (frameId: string) => void;
  readonly setPreferredWorldFrameId: (frameId: string) => void;
  readonly setSceneUpAxis: (axis: Mcap3dSceneUpAxis) => void;
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

/**
 * Provider-tolerant read for modal chrome that renders with or without a
 * playback host (tests, isolated sidebars). Null means no scene exists to
 * orient, and callers should omit their scene-orientation controls.
 */
export function useOptionalMcap3dViewSettings(): Mcap3dViewSettingsContextValue | null {
  return useContext(Mcap3dViewSettingsContext);
}
