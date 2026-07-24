import * as THREE from "three";
import * as TSL from "three/tsl";

import { POINT_COMPONENT_COUNT } from "../point-cloud-colors";

/** Storage layout used by a point-cloud position buffer. */
export type GpuPointCloudPositionLayout = "flat" | "vec3";

/** TSL node shape used by point-cloud position and sampling helpers. */
export interface GpuPointCloudNode extends TSL.Node {
  readonly x: GpuPointCloudNode;
  readonly y: GpuPointCloudNode;
  readonly z: GpuPointCloudNode;
  add(value: GpuPointCloudNode | number): GpuPointCloudNode;
  mul(value: GpuPointCloudNode | number): GpuPointCloudNode;
}

interface GpuPointCloudStorageNode {
  element(index: GpuPointCloudNode): GpuPointCloudNode;
  toReadOnly(): GpuPointCloudStorageNode;
}

// Fiber's bundled Three typings lag the runtime's storage/index TSL exports.
const pointCloudTsl = TSL as unknown as {
  readonly instanceIndex: GpuPointCloudNode;
  storage(
    attribute: THREE.BufferAttribute,
    type: "float" | "vec3",
    count: number,
  ): GpuPointCloudStorageNode;
  vec3(
    x: GpuPointCloudNode,
    y: GpuPointCloudNode,
    z: GpuPointCloudNode,
  ): GpuPointCloudNode;
};

/** Shader counterpart of `gpuPointCloudSampleIndex`, shared by draw and pick. */
export function gpuPointCloudSampleIndexNode(): GpuPointCloudNode {
  return pointCloudTsl.instanceIndex;
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

/** Reads one scalar channel from the same canonical sample index. */
export function gpuPointCloudScalarNode(
  attribute: THREE.BufferAttribute,
  sampleIndex: GpuPointCloudNode,
): TSL.Node {
  return pointCloudTsl
    .storage(attribute, "float", attribute.count)
    .toReadOnly()
    .element(sampleIndex);
}
