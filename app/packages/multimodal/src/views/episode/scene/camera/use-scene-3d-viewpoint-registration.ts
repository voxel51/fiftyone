import { useEffect, useRef, useState } from "react";

import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../../visualization/scene-3d/types";
import type { Scene3dUpAxis } from "../../spatial/view-preferences";
import type {
  Scene3dCameraNavigationMode,
  Scene3dViewStateStore,
} from "./scene-3d-view-state";
import {
  type Scene3dViewpointController,
  useRegisterScene3dViewpoint,
} from "./scene-3d-viewpoint-context";
import {
  normalizeScene3dCameraProjection,
  type Scene3dViewpointStore,
} from "./scene-3d-viewpoint";

interface Scene3dViewpointActions {
  readonly setCameraNavigationMode: (mode: Scene3dCameraNavigationMode) => void;
  readonly setPose: (pose: PointCloudCameraPose) => void;
  readonly setProjection: (projection: PointCloudCameraProjection) => void;
}

/** Creates the state, persistence, and tracking fan-out for viewpoint commands. */
export function createScene3dViewpointActions({
  handleCameraPoseChange,
  setCameraNavigationMode,
  setCameraProjection,
  viewStateStore,
  viewpointStore,
}: {
  readonly handleCameraPoseChange: (
    pose: PointCloudCameraPose,
    source: "focus",
  ) => void;
  readonly setCameraNavigationMode: (mode: Scene3dCameraNavigationMode) => void;
  readonly setCameraProjection: (
    projection: PointCloudCameraProjection,
  ) => void;
  readonly viewStateStore: Scene3dViewStateStore;
  readonly viewpointStore: Scene3dViewpointStore;
}): Scene3dViewpointActions {
  return {
    setCameraNavigationMode: (mode) => {
      setCameraNavigationMode(mode);
      viewpointStore.publish({ cameraNavigationMode: mode });
      viewStateStore.recordCameraNavigationMode(mode);
    },
    setPose: (pose) => {
      viewpointStore.publish({ pose });
      handleCameraPoseChange(pose, "focus");
    },
    setProjection: (projection) => {
      const normalized = normalizeScene3dCameraProjection(projection);
      setCameraProjection(normalized);
      viewpointStore.publish({ projection: normalized });
      viewStateStore.recordCameraProjection(normalized);
    },
  };
}

/** Registers one stable cross-tile controller around the live viewpoint store. */
export function useScene3dViewpointRegistration({
  cameraNavigationMode,
  cameraProjection,
  handleCameraPoseChange,
  sceneUpAxis,
  setCameraNavigationMode,
  setCameraProjection,
  tileId,
  viewStateStore,
  viewpointStore,
}: {
  readonly cameraNavigationMode: Scene3dCameraNavigationMode;
  readonly cameraProjection: PointCloudCameraProjection;
  readonly handleCameraPoseChange: (
    pose: PointCloudCameraPose,
    source: "focus",
  ) => void;
  readonly sceneUpAxis: Scene3dUpAxis;
  readonly setCameraNavigationMode: (mode: Scene3dCameraNavigationMode) => void;
  readonly setCameraProjection: (
    projection: PointCloudCameraProjection,
  ) => void;
  readonly tileId: string | null | undefined;
  readonly viewStateStore: Scene3dViewStateStore;
  readonly viewpointStore: Scene3dViewpointStore;
}): void {
  const actionsRef = useRef<Scene3dViewpointActions>({
    setCameraNavigationMode: () => undefined,
    setPose: () => undefined,
    setProjection: () => undefined,
  });
  actionsRef.current = createScene3dViewpointActions({
    handleCameraPoseChange,
    setCameraNavigationMode,
    setCameraProjection,
    viewStateStore,
    viewpointStore,
  });
  const [controller] = useState<Scene3dViewpointController>(() => ({
    ...viewpointStore,
    setCameraNavigationMode: (mode) =>
      actionsRef.current.setCameraNavigationMode(mode),
    setPose: (pose) => actionsRef.current.setPose(pose),
    setProjection: (projection) => actionsRef.current.setProjection(projection),
  }));
  useRegisterScene3dViewpoint(tileId, controller);

  // This effect publishes infrequent camera settings to the sidebar store.
  useEffect(() => {
    viewpointStore.publish({
      cameraNavigationMode,
      projection: cameraProjection,
      sceneUpAxis,
    });
  }, [cameraNavigationMode, cameraProjection, sceneUpAxis, viewpointStore]);
}
