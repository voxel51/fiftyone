export const FO3D_CAMERA_LIFECYCLE = {
  WAITING_FOR_SCENE: "waiting_for_scene",
  WAITING_FOR_BOUNDS: "waiting_for_bounds",
  RESTORING_CAMERA: "restoring_camera",
  READY: "ready",
} as const;

export type Fo3dCameraLifecycleState =
  typeof FO3D_CAMERA_LIFECYCLE[keyof typeof FO3D_CAMERA_LIFECYCLE];

export const FO3D_CAMERA_LIFECYCLE_ACTION = {
  WAIT_FOR_SCENE: "wait_for_scene",
  WAIT_FOR_BOUNDS: "wait_for_bounds",
  START_RESTORE: "start_restore",
  MARK_READY: "mark_ready",
} as const;

type Fo3dCameraLifecycleActionType =
  typeof FO3D_CAMERA_LIFECYCLE_ACTION[keyof typeof FO3D_CAMERA_LIFECYCLE_ACTION];

export type Fo3dCameraLifecycleAction = {
  type: Fo3dCameraLifecycleActionType;
};

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

export const isFo3dCameraLifecycleReady = (
  state: Fo3dCameraLifecycleState
): boolean => state === FO3D_CAMERA_LIFECYCLE.READY;
