import type { CameraImageRayModel } from "../../../../visualization/panels/point-cloud";
import {
  unprojectMcapCameraPixel,
  type McapCameraModel,
} from "./mcap-camera-model";

const rayModelCache = new WeakMap<McapCameraModel, CameraImageRayModel>();

/** Adapts the MCAP camera model to the renderer-neutral 3D ray contract. */
export function mcapCameraRayModel(
  model: McapCameraModel,
): CameraImageRayModel {
  const cached = rayModelCache.get(model);
  if (cached) {
    return cached;
  }
  const rayModel: CameraImageRayModel = {
    height: model.height,
    rayForPixel: (u, v) => unprojectMcapCameraPixel(model, u, v),
    width: model.width,
  };
  rayModelCache.set(model, rayModel);
  return rayModel;
}
