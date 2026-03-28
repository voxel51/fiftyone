import type { FoScene } from "./render-types";

/**
 * Canonical lifecycle states for the FO3D camera bootstrap flow.
 */
export const FO3D_CAMERA_LIFECYCLE = {
  WAITING_FOR_SCENE: "waiting_for_scene",
  WAITING_FOR_BOUNDS: "waiting_for_bounds",
  RESTORING_CAMERA: "restoring_camera",
  READY: "ready",
} as const;

/**
 * Union of all valid FO3D camera lifecycle states.
 */
export type Fo3dCameraLifecycleState =
  (typeof FO3D_CAMERA_LIFECYCLE)[keyof typeof FO3D_CAMERA_LIFECYCLE];

/**
 * Reducer actions that advance the FO3D camera bootstrap flow.
 */
export const FO3D_CAMERA_LIFECYCLE_ACTION = {
  WAIT_FOR_SCENE: "wait_for_scene",
  WAIT_FOR_BOUNDS: "wait_for_bounds",
  START_RESTORE: "start_restore",
  MARK_READY: "mark_ready",
} as const;

type Fo3dCameraLifecycleActionType =
  (typeof FO3D_CAMERA_LIFECYCLE_ACTION)[keyof typeof FO3D_CAMERA_LIFECYCLE_ACTION];

/**
 * Action payload accepted by the FO3D camera lifecycle reducer.
 */
export type Fo3dCameraLifecycleAction = {
  type: Fo3dCameraLifecycleActionType;
};

/**
 * Reducer that tracks when the FO3D camera can safely restore and render.
 */
export const fo3dCameraLifecycleReducer = (
  state: Fo3dCameraLifecycleState,
  action: Fo3dCameraLifecycleAction
): Fo3dCameraLifecycleState => {
  switch (action.type) {
    case FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_SCENE:
      return FO3D_CAMERA_LIFECYCLE.WAITING_FOR_SCENE;
    case FO3D_CAMERA_LIFECYCLE_ACTION.WAIT_FOR_BOUNDS:
      return FO3D_CAMERA_LIFECYCLE.WAITING_FOR_BOUNDS;
    case FO3D_CAMERA_LIFECYCLE_ACTION.START_RESTORE:
      return FO3D_CAMERA_LIFECYCLE.RESTORING_CAMERA;
    case FO3D_CAMERA_LIFECYCLE_ACTION.MARK_READY:
      return FO3D_CAMERA_LIFECYCLE.READY;
    default:
      return state;
  }
};

/**
 * Returns whether the camera lifecycle has completed its restore flow.
 */
export const isFo3dCameraLifecycleReady = (
  state: Fo3dCameraLifecycleState
): boolean => state === FO3D_CAMERA_LIFECYCLE.READY;

/**
 * Returns whether the FO3D scene can render interactive content yet.
 *
 * Scenes without root assets are considered ready as soon as the scene
 * definition exists, while scenes with assets wait for the camera lifecycle
 * to finish restoring against computed bounds.
 */
export const isFo3dSceneReady = ({
  cameraLifecycleState,
  foScene,
  rootAssetCount,
}: {
  cameraLifecycleState: Fo3dCameraLifecycleState;
  foScene: FoScene | null;
  rootAssetCount: number;
}): boolean => {
  return (
    Boolean(foScene) &&
    (rootAssetCount === 0 || isFo3dCameraLifecycleReady(cameraLifecycleState))
  );
};
