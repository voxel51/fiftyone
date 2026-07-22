import type {
  CameraFrustumPanelLayer,
  SceneRayPanelLayer,
} from "../../../visualization/scene-3d";
import type { DepthHover } from "./depth-sampling";
import type { FrameTransformResolver } from "./frame-transforms/use-frame-transforms";

/** Resolution of a hovered depth sample into one 3D pane's world frame. */
export type DepthRayResolution =
  | { readonly layer: SceneRayPanelLayer; readonly status: "ready" }
  | { readonly status: "pending" | "missing" };

/**
 * Places a hovered depth ray using the displayed matching frustum when
 * possible, so the ray and frustum share an identical camera pose.
 */
export function resolveDepthRay({
  frustumLayers,
  hover,
  resolveFrameTransform,
  timeNs,
  worldFrameId,
}: {
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly hover: DepthHover;
  readonly resolveFrameTransform: FrameTransformResolver;
  readonly timeNs?: bigint;
  readonly worldFrameId: string;
}): DepthRayResolution {
  const layerBase = {
    end: hover.position,
    id: `depth-ray:${hover.imageStream}`,
    start: [0, 0, 0] as const,
  };
  if (!worldFrameId) {
    return { status: "missing" };
  }
  if (hover.cameraFrameId === worldFrameId) {
    return { layer: layerBase, status: "ready" };
  }

  const matchingFrustum = frustumLayers.find(
    (layer) =>
      layer.imageStream === hover.imageStream &&
      layer.frame.coordinateFrameId === hover.cameraFrameId &&
      layer.frameTransform,
  );
  if (matchingFrustum?.frameTransform) {
    return {
      layer: { ...layerBase, frameTransform: matchingFrustum.frameTransform },
      status: "ready",
    };
  }

  if (timeNs === undefined) {
    return { status: "pending" };
  }

  const resolution = resolveFrameTransform(
    hover.cameraFrameId,
    worldFrameId,
    timeNs,
  );
  if (resolution.status !== "resolved") {
    return { status: resolution.status };
  }
  return {
    layer: { ...layerBase, frameTransform: resolution.transform },
    status: "ready",
  };
}
