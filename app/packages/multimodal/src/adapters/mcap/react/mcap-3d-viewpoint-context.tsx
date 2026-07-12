import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
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

/** Live viewpoint store plus commands accepted by a mounted 3D tile. */
export interface Mcap3dViewpointController extends Mcap3dViewpointStore {
  setCameraNavigationMode(mode: Mcap3dCameraNavigationMode): void;
  setPose(pose: PointCloudCameraPose): void;
  setProjection(projection: PointCloudCameraProjection): void;
}

interface Mcap3dViewpointRegistryValue {
  readonly controllers: ReadonlyMap<string, Mcap3dViewpointController>;
  readonly register: (
    tileId: string,
    controller: Mcap3dViewpointController,
  ) => () => void;
}

const Mcap3dViewpointRegistryContext =
  createContext<Mcap3dViewpointRegistryValue | null>(null);

const emptyStore = createMcap3dViewpointStore({
  cameraNavigationMode: "relative",
  pose: null,
  projection: DEFAULT_POINT_CLOUD_CAMERA_PROJECTION,
  sceneUpAxis: "z",
});

/** Registry that lets the modal sidebar address its active 3D tile. */
export const Mcap3dViewpointProvider: React.FC<{
  readonly children: React.ReactNode;
}> = ({ children }) => {
  const [controllers, setControllers] = useState<
    ReadonlyMap<string, Mcap3dViewpointController>
  >(() => new Map());
  const register = useCallback(
    (tileId: string, controller: Mcap3dViewpointController) => {
      setControllers((current) => {
        if (current.get(tileId) === controller) return current;
        const next = new Map(current);
        next.set(tileId, controller);
        return next;
      });
      return () => {
        setControllers((current) => {
          if (current.get(tileId) !== controller) return current;
          const next = new Map(current);
          next.delete(tileId);
          return next;
        });
      };
    },
    [],
  );
  const value = useMemo(
    () => ({ controllers, register }),
    [controllers, register],
  );

  return (
    <Mcap3dViewpointRegistryContext.Provider value={value}>
      {children}
    </Mcap3dViewpointRegistryContext.Provider>
  );
};

/** Registers a stable 3D tile controller for the provider's mounted lifetime. */
export function useRegisterMcap3dViewpoint(
  tileId: string | null | undefined,
  controller: Mcap3dViewpointController,
): void {
  const register = useContext(Mcap3dViewpointRegistryContext)?.register;
  // This effect keeps the controller registered while its tile is mounted.
  useEffect(() => {
    if (!tileId || !register) return undefined;
    return register(tileId, controller);
  }, [controller, register, tileId]);
}

/** Subscribes to the preferred 3D tile, or the first available tile. */
export function useMcap3dViewpoint(
  preferredTileId: string | null | undefined,
): {
  readonly controller: Mcap3dViewpointController;
  readonly snapshot: ReturnType<Mcap3dViewpointStore["getSnapshot"]>;
} | null {
  const registry = useContext(Mcap3dViewpointRegistryContext);
  const controller = useMemo<Mcap3dViewpointController | null>(() => {
    const preferred = preferredTileId
      ? registry?.controllers.get(preferredTileId)
      : undefined;
    const first = registry
      ? registry.controllers.values().next().value
      : undefined;
    return preferred ?? first ?? null;
  }, [preferredTileId, registry]);
  const store = controller ?? emptyStore;
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return controller ? { controller, snapshot } : null;
}
