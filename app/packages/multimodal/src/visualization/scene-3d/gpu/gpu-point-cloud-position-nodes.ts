import * as THREE from "three";
import * as TSL from "three/tsl";

import { POINT_COMPONENT_COUNT } from "../point-cloud-colors";
import type {
  PointCloudChannelNode,
  PointCloudChannelTslFacade,
  PointCloudPositionNode,
  PointCloudPositionTslFacade,
} from "../../tsl-chainables";

/** Storage layout used by a point-cloud position buffer. */
export type GpuPointCloudPositionLayout = "flat" | "vec3";

/** TSL node shape used by point-cloud position and sampling helpers. */
export type GpuPointCloudNode = PointCloudPositionNode;

/** Instance index shape accepted by compact point-cloud channel reads. */
export type GpuPointCloudSampleIndexNode = PointCloudChannelNode;

// Fiber's bundled Three typings lag the runtime's storage/index TSL exports.
const pointCloudTsl: PointCloudPositionTslFacade = TSL;
const pointCloudIndexTsl: PointCloudChannelTslFacade = TSL;

/** Shader counterpart of `gpuPointCloudSampleIndex`, shared by draw and pick. */
export function gpuPointCloudSampleIndexNode(): GpuPointCloudSampleIndexNode {
  return pointCloudTsl.instanceIndex;
}

/**
 * Compute-culled counterpart of `gpuPointCloudSampleIndexNode`: the rendered
 * instance reads its canonical sample index from the compacted visible-index
 * buffer written by `gpu-point-cloud-compute-cull`. Shared by draw and pick so
 * both resolve the same instance to the same sample.
 */
export function gpuPointCloudCulledSampleIndexNode(
  visibleIndices: THREE.BufferAttribute,
): GpuPointCloudSampleIndexNode {
  return pointCloudIndexTsl
    .storage(visibleIndices, "uint", visibleIndices.count)
    .toReadOnly()
    .element(pointCloudTsl.instanceIndex);
}

/** Reads one sampled position without materializing a second point array. */
export function gpuPointCloudPositionNode(
  attribute: THREE.BufferAttribute,
  layout: GpuPointCloudPositionLayout,
  sampleIndex: GpuPointCloudNode,
): GpuPointCloudNode {
  if (layout === "vec3") {
    return pointCloudTsl
      .storage(attribute, "vec3", attribute.count)
      .toReadOnly()
      .element(sampleIndex);
  }

  // Flat float storage is intentional for decoder payloads: Three otherwise
  // pads vec3 storage elements to vec4 on the main thread before upload.
  const values = pointCloudTsl
    .storage(attribute, "float", attribute.count)
    .toReadOnly();
  const offset = sampleIndex.mul(POINT_COMPONENT_COUNT);
  return pointCloudTsl.vec3(
    values.element(offset),
    values.element(offset.add(1)),
    values.element(offset.add(2)),
  );
}
