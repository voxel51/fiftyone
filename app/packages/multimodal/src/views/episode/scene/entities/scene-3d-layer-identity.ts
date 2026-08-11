import type {
  CameraFrustumParentPosition,
  PointCloudFrameTransform,
} from "../../../../visualization/scene-3d/types";

/**
 * Reduces a freshly wrapped transform to the values that affect scene output.
 * This lets keyed layer decorators survive unrelated source-toggle renders.
 */
export function frameTransformIdentityInputs(
  transform: PointCloudFrameTransform | undefined,
): readonly unknown[] {
  return transform
    ? [
        transform.resolutionKind,
        transform.sourceFrameId,
        transform.targetFrameId,
        transform.translation.x,
        transform.translation.y,
        transform.translation.z,
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ]
    : [null];
}

/** Stable identity inputs for a frustum's immediate-parent position. */
export function frustumParentPositionIdentityInputs(
  position: CameraFrustumParentPosition | undefined,
): readonly unknown[] {
  if (!position) return [null];
  if (position.kind === "unavailable") {
    return [position.kind, position.reason];
  }
  return [
    position.kind,
    position.parentFrameId,
    position.origin[0],
    position.origin[1],
    position.origin[2],
  ];
}
