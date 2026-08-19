import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

import type { PointCloudRenderPayload } from "../../../ir";
import type {
  GpuPointCloudProjectionPickerHandle,
  GpuPointCloudProjectionPickRequest,
  GpuPointCloudProjectionPickResult,
} from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import { sensorToCameraMatrix } from "../../../visualization/composition/gpu-point-cloud-projection";
import {
  projectCameraPoint,
  type CameraModel,
} from "../spatial/camera-geometry/camera-model";
import type {
  ProjectionRotation,
  ProjectionTranslation,
} from "./image-projection";

/** Sampled point layer used by the WebGL2 projection dwell picker. */
export interface WebGlPointCloudProjectionPickLayer {
  readonly payload: PointCloudRenderPayload;
  readonly renderedPointCount: number;
  readonly resourceKey: string;
  readonly rotation: ProjectionRotation;
  /** Full decoded frame bound for sampled source identities. */
  readonly sourcePointCount: number;
  readonly translation: ProjectionTranslation;
}

/** CPU camera model and visible layers for one WebGL2 image view. */
export interface WebGlPointCloudProjectionPickerScene {
  readonly cameraModel: CameraModel;
  readonly layers: readonly WebGlPointCloudProjectionPickLayer[];
}

/**
 * Ref-only picker used when the shared image renderer selected WebGL2. Work is
 * performed only after pointer dwell; ordinary playback does no CPU projection.
 */
export const WebGlPointCloudProjectionPicker = forwardRef<
  GpuPointCloudProjectionPickerHandle,
  WebGlPointCloudProjectionPickerScene
>(function WebGlPointCloudProjectionPicker(scene, forwardedRef) {
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const generationRef = useRef(0);
  const handle = useMemo<GpuPointCloudProjectionPickerHandle>(
    () => ({
      invalidate: () => {
        generationRef.current += 1;
      },
      pick: (request) => {
        const generation = ++generationRef.current;
        const result = pickWebGlPointCloudProjection(sceneRef.current, request);
        return Promise.resolve().then(() =>
          generation === generationRef.current ? result : null,
        );
      },
    }),
    [],
  );
  useImperativeHandle(forwardedRef, () => handle, [handle]);
  return null;
});

/** Nearest rendered projected sample, using the production CPU camera model. */
export function pickWebGlPointCloudProjection(
  scene: WebGlPointCloudProjectionPickerScene,
  request: GpuPointCloudProjectionPickRequest,
): GpuPointCloudProjectionPickResult | null {
  if (
    !(request.radiusPx > 0) ||
    !Number.isFinite(request.targetU) ||
    !Number.isFinite(request.targetV)
  ) {
    return null;
  }

  const radiusSq = request.radiusPx * request.radiusPx;
  let best:
    | (GpuPointCloudProjectionPickResult & { readonly distanceSq: number })
    | null = null;
  for (let layerIndex = 0; layerIndex < scene.layers.length; layerIndex++) {
    const layer = scene.layers[layerIndex];
    const payload = layer.payload;
    const sampleCount = Math.min(
      payload.sampledPointCount,
      Math.max(0, Math.floor(layer.renderedPointCount)),
    );
    const transform = sensorToCameraMatrix({
      rotation: layer.rotation,
      translation: layer.translation,
    }).elements;
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
      if (sampleIndex >= payload.sourceIndices.length) {
        continue;
      }
      const sourceIndex = payload.sourceIndices[sampleIndex];
      if (sourceIndex >= layer.sourcePointCount) {
        continue;
      }
      const offset = sampleIndex * 3;
      const x = payload.positions[offset];
      const y = payload.positions[offset + 1];
      const z = payload.positions[offset + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      const projected = projectCameraPoint(scene.cameraModel, [
        transform[0] * x + transform[4] * y + transform[8] * z + transform[12],
        transform[1] * x + transform[5] * y + transform[9] * z + transform[13],
        transform[2] * x + transform[6] * y + transform[10] * z + transform[14],
      ]);
      if (
        !projected ||
        projected.u < 0 ||
        projected.v < 0 ||
        projected.u >= scene.cameraModel.width ||
        projected.v >= scene.cameraModel.height
      ) {
        continue;
      }
      const du = projected.u - request.targetU;
      const dv = projected.v - request.targetV;
      const distanceSq = du * du + dv * dv;
      if (distanceSq > radiusSq || (best && distanceSq >= best.distanceSq)) {
        continue;
      }
      best = {
        distanceSq,
        layerIndex,
        resourceKey: layer.resourceKey,
        sampleIndex,
        sourceIndex,
      };
    }
  }
  if (!best) return null;
  const { distanceSq: _distanceSq, ...result } = best;
  return result;
}
