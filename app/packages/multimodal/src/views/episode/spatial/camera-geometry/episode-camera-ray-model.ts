import type { CameraImageRayModel } from "../../../../visualization/scene-3d";
import {
  unprojectEpisodeCameraPixel,
  type EpisodeCameraModel,
} from "./episode-camera-model";

const rayModelCache = new WeakMap<EpisodeCameraModel, CameraImageRayModel>();

/** Adapts the episode camera model to the renderer-neutral 3D ray contract. */
export function episodeCameraRayModel(
  model: EpisodeCameraModel,
): CameraImageRayModel {
  const cached = rayModelCache.get(model);
  if (cached) {
    return cached;
  }
  const rayModel: CameraImageRayModel = {
    height: model.height,
    rayForPixel: (u, v) => unprojectEpisodeCameraPixel(model, u, v),
    width: model.width,
  };
  rayModelCache.set(model, rayModel);
  return rayModel;
}
