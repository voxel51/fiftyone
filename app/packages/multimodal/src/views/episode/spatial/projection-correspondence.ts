import * as THREE from "three";

import type {
  CameraFrustumPanelLayer,
  PointCloudFrameTransform,
  PointCloudPanelLayer,
  SceneRayPanelLayer,
} from "../../../visualization/scene-3d";
import type { HoverEcho } from "../interaction/point-hover/hover-echo";

/**
 * Resolves an image-originated point hover into a connector between the camera
 * and point artifacts displayed by one 3D pane. This is deliberately a visual
 * correspondence, not a reconstructed measurement ray.
 */
export function resolveProjectionCorrespondence({
  frustumLayers,
  hover,
  pointCloudLayers,
  worldFrameId,
}: {
  readonly frustumLayers: readonly CameraFrustumPanelLayer[];
  readonly hover: HoverEcho | null;
  readonly pointCloudLayers: readonly PointCloudPanelLayer[];
  readonly worldFrameId: string;
}): SceneRayPanelLayer | null {
  const source = hover?.source;
  if (
    !hover ||
    hover.kind !== "point" ||
    source?.kind !== "image-projection" ||
    !worldFrameId
  ) {
    return null;
  }

  const pointLayer = pointCloudLayers.find(
    (layer) =>
      layer.id === hover.stream && layer.contentTimeNs === hover.contentTimeNs,
  );
  if (!pointLayer) {
    return null;
  }

  const frustumLayer = frustumLayers.find(
    (layer) =>
      layer.imageStream === source.imageStream &&
      layer.frame.coordinateFrameId === source.cameraFrameId,
  );
  if (!frustumLayer) {
    return null;
  }

  const start = displayedWorldPosition({
    frameId: frustumLayer.frame.coordinateFrameId,
    frameTransform: frustumLayer.frameTransform,
    position: [0, 0, 0],
    worldFrameId,
  });
  const end = displayedWorldPosition({
    frameId: pointLayer.frame.coordinateFrameId,
    frameTransform: pointLayer.frameTransform,
    position: hover.position,
    worldFrameId,
  });
  if (!start || !end) {
    return null;
  }

  return {
    end,
    id: `projection-correspondence:${source.imageStream}:${hover.stream}:${hover.contentTimeNs.toString()}`,
    role: "projection-correspondence",
    start,
  };
}

function displayedWorldPosition({
  frameId,
  frameTransform,
  position,
  worldFrameId,
}: {
  readonly frameId?: string;
  readonly frameTransform?: PointCloudFrameTransform;
  readonly position: readonly [number, number, number];
  readonly worldFrameId: string;
}): readonly [number, number, number] | null {
  if (!frameTransform) {
    return frameId === worldFrameId ? position : null;
  }
  if (frameTransform.targetFrameId !== worldFrameId) {
    return null;
  }

  const worldPosition = new THREE.Vector3(...position)
    .applyQuaternion(frameTransform.rotation)
    .add(frameTransform.translation);
  return [worldPosition.x, worldPosition.y, worldPosition.z];
}
