import * as THREE from "three";

import type { PointCloudRenderPayload } from "../../ir";
import type { ResolvedGpuPointCloudColor } from "./gpu/gpu-point-cloud-color";
import { writeGpuPointCloudColorAtSample } from "./gpu/gpu-point-cloud-color";
import { gpuPointCloudDrawCount } from "./gpu/gpu-point-cloud-sampling";
import {
  EMPTY_POINT_CLOUD_BOUNDS_SIZE,
  POINT_COMPONENT_COUNT,
} from "./point-cloud-colors";
import type { PointCloudRenderData } from "./types";

/** Caller-owned grow-only storage for WebGL point-color expansion. */
export interface WebGlPointCloudRenderScratch {
  colors: Float32Array;
}

/**
 * Expands only the progressive payload prefix drawn by this surface into
 * ordinary attributes understood by Three's WebGL2 backend.
 */
export function buildWebGlPointCloudRenderData({
  color,
  maxRenderedPoints,
  payload,
  scratch,
}: {
  readonly color: ResolvedGpuPointCloudColor;
  readonly maxRenderedPoints: number;
  readonly payload: PointCloudRenderPayload;
  readonly scratch?: WebGlPointCloudRenderScratch;
}): PointCloudRenderData {
  const renderedPointCount = gpuPointCloudDrawCount(
    payload.sampledPointCount,
    maxRenderedPoints,
  );
  const componentCount = renderedPointCount * POINT_COMPONENT_COUNT;
  const positions = payload.positions.subarray(0, componentCount);
  const colors = pointColorPrefix(scratch, componentCount);
  for (
    let sampleIndex = 0;
    sampleIndex < renderedPointCount;
    sampleIndex += 1
  ) {
    writeGpuPointCloudColorAtSample(
      colors,
      sampleIndex * POINT_COMPONENT_COUNT,
      color,
      payload,
      sampleIndex,
    );
  }

  return {
    bounds: pointCloudPayloadBounds(payload),
    colorRamp: renderedPointCount > 0 ? color.colorRamp : null,
    colors,
    finitePointCount: payload.finitePointCount,
    positions,
    renderedPointCount,
  };
}

function pointColorPrefix(
  scratch: WebGlPointCloudRenderScratch | undefined,
  componentCount: number,
): Float32Array {
  if (!scratch) {
    return new Float32Array(componentCount);
  }
  if (scratch.colors.length < componentCount) {
    scratch.colors = new Float32Array(
      Math.max(componentCount, scratch.colors.length * 2),
    );
  }
  return scratch.colors.subarray(0, componentCount);
}

function pointCloudPayloadBounds(payload: PointCloudRenderPayload): THREE.Box3 {
  if (payload.bounds) {
    return new THREE.Box3(
      new THREE.Vector3(...payload.bounds.min),
      new THREE.Vector3(...payload.bounds.max),
    );
  }
  return new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(),
    new THREE.Vector3(
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      EMPTY_POINT_CLOUD_BOUNDS_SIZE,
    ),
  );
}
