import * as THREE from "three";

import type { PointCloudRenderPayload } from "../../ir";
import { createKeyedLeaseRegistry } from "../keyed-lease-registry";
import {
  createGpuPointCloudChannelResource,
  updateGpuPointCloudChannelResource,
  type GpuPointCloudChannelResource,
} from "../scene-3d/gpu/gpu-point-cloud-channel-nodes";

const POINT_COMPONENT_COUNT = 3;

/** Typical modal: lidar + five radars, with room for duplicated topics. */
export const GPU_PROJECTION_RESOURCE_RETENTION_CAP = 12;

/** Identity and decoded payload used to acquire a reusable projection resource. */
export interface GpuPointCloudProjectionResourceInput {
  /** Immutable frame identity. Re-delivery of the same content is ignored. */
  readonly contentKey: string;
  readonly payload: PointCloudRenderPayload;
  /** Stable source + topic identity shared by every camera view. */
  readonly streamKey: string;
}

/** Grow-only GPU attributes shared by every view of one point-cloud topic. */
export interface GpuPointCloudProjectionResource {
  colorChannel: GpuPointCloudChannelResource | null;
  /** Immutable frame identity currently resident in the reusable buffers. */
  contentKey: string;
  /** Dedicated sprite quad whose disposal releases node-owned GPU buffers. */
  readonly geometry: THREE.PlaneGeometry;
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  sampledPointCount: number;
  readonly scalarChannels: Map<string, GpuPointCloudChannelResource>;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
  /** CPU mapping retained for O(1) hover payload reconstruction. */
  sourceIndices: Uint32Array;
  readonly streamKey: string;
}

interface InternalProjectionResource extends GpuPointCloudProjectionResource {
  capacity: number;
}

// This registry belongs to the shared image renderer's module lifetime. One
// entry is reusable frame storage for (recording, topic); camera views hold
// leases on the same entry and own only their matrices/material uniforms.
let totalFrameUpdates = 0;
let totalResourceAllocations = 0;
const projectionResourceRegistry = createKeyedLeaseRegistry<
  string,
  Omit<GpuPointCloudProjectionResourceInput, "streamKey">,
  InternalProjectionResource
>({
  create: (streamKey, { contentKey, payload }) =>
    createResource(streamKey, contentKey, payload),
  dispose: disposeResource,
  needsGrowth: (resource, { payload }) => payload.capacity > resource.capacity,
  retentionCap: GPU_PROJECTION_RESOURCE_RETENTION_CAP,
  touchOnRetain: true,
  update: (resource, { contentKey, payload }) => {
    if (resource.contentKey !== contentKey) {
      updateResource(resource, contentKey, payload);
    }
  },
});

/**
 * Returns one grow-only buffer set per source topic. Frame changes replace the
 * transferred typed-array views and bump attribute versions exactly once;
 * Three then issues one queue.writeBuffer per active attribute on the shared
 * renderer, regardless of camera count.
 */
export function getGpuPointCloudProjectionResource({
  contentKey,
  payload,
  streamKey,
}: GpuPointCloudProjectionResourceInput): GpuPointCloudProjectionResource {
  return projectionResourceRegistry.get(streamKey, { contentKey, payload });
}

/** Pins a resource while a scene object/material references its attributes. */
export function retainGpuPointCloudProjectionResource(
  resource: GpuPointCloudProjectionResource,
): () => void {
  return projectionResourceRegistry.retain(
    resource as InternalProjectionResource,
  );
}

/** Returns allocation and retention counters for projection resources. */
export function gpuPointCloudProjectionResourceStats(): {
  readonly activeCount: number;
  readonly entryCount: number;
  readonly retiredCount: number;
  readonly totalFrameUpdates: number;
  readonly totalResourceAllocations: number;
} {
  const { activeCount, entryCount, retiredCount } =
    projectionResourceRegistry.stats();
  return {
    activeCount,
    entryCount,
    retiredCount,
    totalFrameUpdates,
    totalResourceAllocations,
  };
}

/** Modal/source/device-loss boundary cleanup. */
export function releaseGpuPointCloudProjectionResources(): void {
  projectionResourceRegistry.releaseAll();
}

/** Retires every topic buffer owned by one recording/source identity. */
export function releaseGpuPointCloudProjectionResourcesForSource(
  sourceKey: string,
): void {
  const prefix = `${sourceKey}\n`;
  projectionResourceRegistry.retireWhere((streamKey) =>
    streamKey.startsWith(prefix),
  );
}

/** Clears projection resources and counters between tests. */
export function resetGpuPointCloudProjectionResourcesForTests(): void {
  releaseGpuPointCloudProjectionResources();
  totalFrameUpdates = 0;
  totalResourceAllocations = 0;
}

function createResource(
  streamKey: string,
  contentKey: string,
  payload: PointCloudRenderPayload,
): InternalProjectionResource {
  const positionAttribute = new THREE.InstancedBufferAttribute(
    payload.positions,
    POINT_COMPONENT_COUNT,
  );
  const colorChannel = payload.rgb
    ? createGpuPointCloudChannelResource(payload.rgb)
    : null;
  const scalarChannels = new Map(
    payload.scalarFields.map((field) => [
      field.name,
      createGpuPointCloudChannelResource(field),
    ]),
  );
  const sourceIndexAttribute = new THREE.InstancedBufferAttribute(
    payload.sourceIndices,
    1,
  );
  // Geometry is the disposal owner for node/storage attributes in Three's
  // WebGPU backend. The quad itself is merely the instanced point primitive.
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("projectionPosition", positionAttribute);
  if (colorChannel) {
    geometry.setAttribute("projectionColor", colorChannel.attribute);
  }
  attachScalarAttributes(geometry, scalarChannels);
  geometry.setAttribute("projectionSourceIndex", sourceIndexAttribute);

  totalResourceAllocations += 1;
  const resource: InternalProjectionResource = {
    capacity: payload.capacity,
    colorChannel,
    contentKey,
    geometry,
    positionAttribute,
    sampledPointCount: normalizedSampleCount(payload),
    scalarChannels,
    sourceIndexAttribute,
    sourceIndices: payload.sourceIndices,
    streamKey,
  };
  return resource;
}

function updateResource(
  resource: InternalProjectionResource,
  contentKey: string,
  payload: PointCloudRenderPayload,
): void {
  // Swap transferred views rather than copying them. Because every camera
  // shares this BufferAttribute object, needsUpdate produces one upload for
  // the new frame instead of one CPU projection/upload per camera.
  replaceAttributeArray(resource.positionAttribute, payload.positions);
  replaceAttributeArray(resource.sourceIndexAttribute, payload.sourceIndices);
  resource.sourceIndices = payload.sourceIndices;

  if (payload.rgb) {
    if (!resource.colorChannel) {
      resource.colorChannel = createGpuPointCloudChannelResource(payload.rgb);
      resource.geometry.setAttribute(
        "projectionColor",
        resource.colorChannel.attribute,
      );
    } else {
      const previous = resource.colorChannel;
      resource.colorChannel = updateGpuPointCloudChannelResource(
        resource.colorChannel,
        payload.rgb,
      );
      if (resource.colorChannel !== previous) {
        resource.geometry.setAttribute(
          "projectionColor",
          resource.colorChannel.attribute,
        );
      }
    }
  } else if (resource.colorChannel) {
    resource.geometry.deleteAttribute("projectionColor");
    resource.colorChannel = null;
  }

  // Scalar attribute slot numbers are derived from Map iteration order. Clear
  // every old slot before reattaching so removed/reordered fields cannot leave
  // a stale geometry binding at projectionScalarN.
  const previousScalarCount = resource.scalarChannels.size;
  const currentScalarNames = new Set(
    payload.scalarFields.map((field) => field.name),
  );
  for (const name of resource.scalarChannels.keys()) {
    if (!currentScalarNames.has(name)) {
      resource.scalarChannels.delete(name);
    }
  }
  for (const field of payload.scalarFields) {
    const channel = resource.scalarChannels.get(field.name);
    if (channel) {
      resource.scalarChannels.set(
        field.name,
        updateGpuPointCloudChannelResource(channel, field),
      );
    } else {
      resource.scalarChannels.set(
        field.name,
        createGpuPointCloudChannelResource(field),
      );
    }
  }
  for (
    let index = 0;
    index < Math.max(previousScalarCount, resource.scalarChannels.size);
    index++
  ) {
    resource.geometry.deleteAttribute(`projectionScalar${index}`);
  }
  attachScalarAttributes(resource.geometry, resource.scalarChannels);

  resource.contentKey = contentKey;
  resource.sampledPointCount = normalizedSampleCount(payload);
  totalFrameUpdates += 1;
}

function replaceAttributeArray(
  attribute: THREE.BufferAttribute,
  array: THREE.TypedArray,
): void {
  attribute.array = array;
  (attribute as unknown as { count: number }).count =
    array.length / attribute.itemSize;
  attribute.needsUpdate = true;
}

function attachScalarAttributes(
  geometry: THREE.BufferGeometry,
  channels: ReadonlyMap<string, GpuPointCloudChannelResource>,
): void {
  let index = 0;
  for (const channel of channels.values()) {
    geometry.setAttribute(`projectionScalar${index++}`, channel.attribute);
  }
}

function normalizedSampleCount(payload: PointCloudRenderPayload): number {
  return Math.min(
    payload.capacity,
    Math.max(0, Math.floor(payload.sampledPointCount)),
  );
}

function disposeResource(resource: InternalProjectionResource): void {
  resource.geometry.dispose();
}
