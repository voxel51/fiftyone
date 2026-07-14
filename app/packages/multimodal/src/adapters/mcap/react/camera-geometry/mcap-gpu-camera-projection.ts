import * as THREE from "three";

import type { GpuCameraProjection } from "../../../../visualization/panels/gpu/gpu-camera-projection";
import {
  sensorToCameraMatrix,
  sensorToImageProjectionMatrix,
  type GpuProjectionRotation,
  type GpuProjectionTranslation,
} from "../../../../visualization/panels/gpu/gpu-point-cloud-projection";
import type { McapCameraModel } from "./mcap-camera-model";

/** Prepares one resolved MCAP camera model for the shared GPU projection path. */
export function mcapGpuCameraProjection({
  model,
  rotation,
  translation,
}: {
  readonly model: McapCameraModel;
  readonly rotation: GpuProjectionRotation;
  readonly translation: GpuProjectionTranslation;
}): GpuCameraProjection | null {
  if (model.kind === "pinhole") {
    const projectionMatrix = sensorToImageProjectionMatrix({
      calibration: {
        height: model.height,
        P: model.projection,
        R: model.rectification,
        width: model.width,
      },
      rotation,
      translation,
    });
    return projectionMatrix ? { kind: "pinhole", projectionMatrix } : null;
  }

  const cameraMatrix = sensorToCameraMatrix({ rotation, translation });
  const intrinsicsX = new THREE.Vector4(model.K[0], model.K[1], model.K[2], 0);
  const intrinsicsY = new THREE.Vector4(model.K[3], model.K[4], model.K[5], 0);
  if (model.kind === "rational-polynomial") {
    return {
      cameraMatrix,
      distortionHigh: new THREE.Vector4(
        model.D[4],
        model.D[5],
        model.D[6],
        model.D[7],
      ),
      distortionLow: new THREE.Vector4(
        model.D[0],
        model.D[1],
        model.D[2],
        model.D[3],
      ),
      intrinsicsX,
      intrinsicsY,
      kind: "rational-polynomial",
      maxRadius: model.maxRadius,
    };
  }
  return {
    cameraMatrix,
    distortion: new THREE.Vector4(
      model.D[0],
      model.D[1],
      model.D[2],
      model.D[3],
    ),
    intrinsicsX,
    intrinsicsY,
    kind: "equidistant",
    maxTheta: model.maxTheta,
  };
}
