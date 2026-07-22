import type { CameraImageRayModel } from "../../../../visualization/scene-3d";
import { unprojectCameraPixel, type CameraModel } from "./camera-model";

const rayModelCache = new WeakMap<CameraModel, CameraImageRayModel>();

/** Adapts the episode camera model to the renderer-neutral 3D ray contract. */
export function cameraRayModel(model: CameraModel): CameraImageRayModel {
  const cached = rayModelCache.get(model);
  if (cached) {
    return cached;
  }
  const rayModel: CameraImageRayModel = {
    height: model.height,
    rayForPixel: (u, v) => unprojectCameraPixel(model, u, v),
    width: model.width,
  };
  rayModelCache.set(model, rayModel);
  return rayModel;
}
