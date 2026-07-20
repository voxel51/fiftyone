import { useSyncExternalStore } from "react";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../visualization/panels/point-cloud/camera-fit-bounds";
import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../visualization/panels/point-cloud/types";
import {
  createEpisode3dViewpointStore,
  type Episode3dViewpointStore,
} from "./episode-3d-viewpoint";
import type { Episode3dCameraNavigationMode } from "./episode-3d-view-state";
import { createEpisodeTileRegistry } from "./episode-tile-registry";

/** Live viewpoint store plus commands accepted by a mounted 3D tile. */
export interface Episode3dViewpointController extends Episode3dViewpointStore {
  setCameraNavigationMode(mode: Episode3dCameraNavigationMode): void;
  setPose(pose: PointCloudCameraPose): void;
  setProjection(projection: PointCloudCameraProjection): void;
}

const registry =
  createEpisodeTileRegistry<Episode3dViewpointController>("Episode3dViewpoint");

const emptyStore = createEpisode3dViewpointStore({
  cameraNavigationMode: "relative",
  pose: null,
  projection: DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
  sceneUpAxis: "z",
});

/** Registry that lets the modal sidebar address its active 3D tile. */
export const Episode3dViewpointProvider = registry.Provider;

/** Registers a stable 3D tile controller for the provider's mounted lifetime. */
export const useRegisterEpisode3dViewpoint = registry.useRegister;

/** Subscribes to the preferred 3D tile, or the first available tile. */
export function useEpisode3dViewpoint(
  preferredTileId: string | null | undefined,
): {
  readonly controller: Episode3dViewpointController;
  readonly snapshot: ReturnType<Episode3dViewpointStore["getSnapshot"]>;
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
