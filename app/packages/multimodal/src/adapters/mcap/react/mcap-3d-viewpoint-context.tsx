import { useSyncExternalStore } from "react";
import { DEFAULT_POINT_CLOUD_CAMERA_PROJECTION } from "../../../visualization/panels/point-cloud/camera-fit-bounds";
import type {
  PointCloudCameraPose,
  PointCloudCameraProjection,
} from "../../../visualization/panels/point-cloud/types";
import {
  createMcap3dViewpointStore,
  type Mcap3dViewpointStore,
} from "./mcap-3d-viewpoint";
import type { Mcap3dCameraNavigationMode } from "./mcap-3d-view-state";
import { createMcapTileRegistry } from "./mcap-tile-registry";

/** Live viewpoint store plus commands accepted by a mounted 3D tile. */
export interface Mcap3dViewpointController extends Mcap3dViewpointStore {
  setCameraNavigationMode(mode: Mcap3dCameraNavigationMode): void;
  setPose(pose: PointCloudCameraPose): void;
  setProjection(projection: PointCloudCameraProjection): void;
}

const registry =
  createMcapTileRegistry<Mcap3dViewpointController>("Mcap3dViewpoint");

const emptyStore = createMcap3dViewpointStore({
  cameraNavigationMode: "relative",
  pose: null,
  projection: DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
  sceneUpAxis: "z",
});

/** Registry that lets the modal sidebar address its active 3D tile. */
export const Mcap3dViewpointProvider = registry.Provider;

/** Registers a stable 3D tile controller for the provider's mounted lifetime. */
export const useRegisterMcap3dViewpoint = registry.useRegister;

/** Subscribes to the preferred 3D tile, or the first available tile. */
export function useMcap3dViewpoint(
  preferredTileId: string | null | undefined,
): {
  readonly controller: Mcap3dViewpointController;
  readonly snapshot: ReturnType<Mcap3dViewpointStore["getSnapshot"]>;
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
