import { useSyncExternalStore } from "react";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../../visualization/scene-3d/camera-fit-bounds";
import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../../visualization/scene-3d/types";
import {
  createScene3dViewpointStore,
  type Scene3dViewpointStore,
} from "./scene-3d-viewpoint";
import type { Scene3dCameraNavigationMode } from "./scene-3d-view-state";
import { createTileRegistry } from "../../interaction/registry";

/** Live viewpoint store plus commands accepted by a mounted 3D tile. */
export interface Scene3dViewpointController extends Scene3dViewpointStore {
  setCameraNavigationMode(this: void, mode: Scene3dCameraNavigationMode): void;
  setPose(this: void, pose: PointCloudCameraPose): void;
  setProjection(this: void, projection: PointCloudCameraProjection): void;
}

const registry =
  createTileRegistry<Scene3dViewpointController>("Episode3dViewpoint");

const emptyStore = createScene3dViewpointStore({
  cameraNavigationMode: "relative",
  pose: null,
  projection: DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
  sceneUpAxis: "z",
});

/** Registry that lets the modal sidebar address its active 3D tile. */
export const Scene3dViewpointProvider = registry.Provider;

/** Registers a stable 3D tile controller for the provider's mounted lifetime. */
export const useRegisterScene3dViewpoint = registry.useRegister;

/** Subscribes to the preferred 3D tile, or the first available tile. */
export function useScene3dViewpoint(
  preferredTileId: string | null | undefined,
): {
  readonly controller: Scene3dViewpointController;
  readonly snapshot: ReturnType<Scene3dViewpointStore["getSnapshot"]>;
} | null {
  const controller = registry.usePrimary(preferredTileId);
  const store = controller ?? emptyStore;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return controller ? { controller, snapshot } : null;
}
