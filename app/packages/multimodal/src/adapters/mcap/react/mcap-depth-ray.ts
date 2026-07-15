import type {
  CameraFrustumPanelLayer,
  SceneRayPanelLayer,
} from "../../../visualization/panels/point-cloud";
import type { McapFrameTransformResolver } from "./use-mcap-frame-transforms";
import type { McapDepthHover } from "./mcap-depth-hover";

/** Resolution of a hovered depth sample into one 3D pane's world frame. */
export type McapDepthRayResolution =
  | { readonly layer: SceneRayPanelLayer; readonly status: "ready" }
  | { readonly status: "pending" | "missing" };

/**
 * Places a hovered depth ray using the displayed matching frustum when
 * possible, so the ray and frustum share an identical camera pose.
 */
export function resolveMcapDepthRay({
  frustumLayers,
  hover,
  resolveFrameTransform,
  timeNs,
  worldFrameId,
}: {
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly hover: McapDepthHover;
  readonly resolveFrameTransform: McapFrameTransformResolver;
  readonly timeNs?: bigint;
  readonly worldFrameId: string;
}): McapDepthRayResolution {
  const layerBase = {
    end: hover.position,
    id: `depth-ray:${hover.imageTopic}`,
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
      layer.imageTopic === hover.imageTopic &&
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
