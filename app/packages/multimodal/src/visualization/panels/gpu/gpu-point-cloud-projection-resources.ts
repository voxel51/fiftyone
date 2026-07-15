import * as THREE from "three";

import type { PointCloudRenderPayload } from "../../../decoders";

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
  colorAttribute: THREE.InstancedBufferAttribute | null;
  /** Immutable frame identity currently resident in the reusable buffers. */
  contentKey: string;
  /** Dedicated sprite quad whose disposal releases node-owned GPU buffers. */
  readonly geometry: THREE.PlaneGeometry;
  readonly positionAttribute: THREE.InstancedBufferAttribute;
  sampledPointCount: number;
  readonly scalarAttributes: Map<string, THREE.InstancedBufferAttribute>;
  readonly sourceIndexAttribute: THREE.InstancedBufferAttribute;
  /** CPU mapping retained for O(1) hover payload reconstruction. */
  sourceIndices: Uint32Array;
  readonly streamKey: string;
}

interface InternalProjectionResource extends GpuPointCloudProjectionResource {
  capacity: number;
  disposed: boolean;
  frameUpdateCount: number;
  retired: boolean;
  retainCount: number;
}

interface ProjectionResourceEntry {
  resource: InternalProjectionResource;
}

const entries = new Map<string, ProjectionResourceEntry>();
const retiredResources = new Set<InternalProjectionResource>();

// This registry belongs to the shared image renderer's module lifetime. One
// entry is reusable frame storage for (recording, topic); camera views hold
// leases on the same entry and own only their matrices/material uniforms.
let evictionScheduled = false;
let totalFrameUpdates = 0;
let totalResourceAllocations = 0;

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
  let entry = entries.get(streamKey);
  if (!entry) {
    entry = { resource: createResource(streamKey, contentKey, payload) };
    entries.set(streamKey, entry);
    scheduleEviction();
    return entry.resource;
  }

  touchEntry(streamKey, entry);
  let resource = entry.resource;
  if (payload.capacity > resource.capacity) {
    // Buffer growth changes storage identity captured by TSL materials. Publish
    // the replacement immediately, but keep the old attributes alive for any
    // camera scene that still references its committed resource.
    resource.retired = true;
    retiredResources.add(resource);
    resource = createResource(streamKey, contentKey, payload);
    entry.resource = resource;
    scheduleRetiredDisposal();
    return resource;
  }

  if (resource.contentKey !== contentKey) {
    updateResource(resource, contentKey, payload);
  }
  return resource;
}

/** Pins a resource while a scene object/material references its attributes. */
export function retainGpuPointCloudProjectionResource(
  resource: GpuPointCloudProjectionResource,
): () => void {
  const internal = resource as InternalProjectionResource;
  if (internal.disposed) {
    return () => undefined;
  }
  internal.retainCount += 1;
  const current = entries.get(internal.streamKey);
  if (current?.resource === internal) {
    touchEntry(internal.streamKey, current);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    internal.retainCount = Math.max(0, internal.retainCount - 1);
    if (internal.retired) {
      scheduleRetiredDisposal();
    } else {
      scheduleEviction();
    }
  };
}

/** Returns allocation and retention counters for projection resources. */
export function gpuPointCloudProjectionResourceStats(): {
  readonly activeCount: number;
  readonly entryCount: number;
  readonly retiredCount: number;
  readonly totalFrameUpdates: number;
  readonly totalResourceAllocations: number;
} {
  let activeCount = 0;
  for (const { resource } of entries.values()) {
    if (resource.retainCount > 0) activeCount++;
  }
  return {
    activeCount,
    entryCount: entries.size,
    retiredCount: retiredResources.size,
    totalFrameUpdates,
    totalResourceAllocations,
  };
}

/** Modal/source/device-loss boundary cleanup. */
export function releaseGpuPointCloudProjectionResources(): void {
  for (const { resource } of entries.values()) disposeResource(resource);
  for (const resource of retiredResources) disposeResource(resource);
  entries.clear();
  retiredResources.clear();
  evictionScheduled = false;
}

/** Retires every topic buffer owned by one recording/source identity. */
export function releaseGpuPointCloudProjectionResourcesForSource(
  sourceKey: string,
): void {
  const prefix = `${sourceKey}\n`;
  for (const [streamKey, entry] of entries) {
    if (!streamKey.startsWith(prefix)) continue;
    entries.delete(streamKey);
    entry.resource.retired = true;
    retiredResources.add(entry.resource);
  }
  scheduleRetiredDisposal();
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
  const colorAttribute = payload.colors
    ? new THREE.InstancedBufferAttribute(payload.colors, POINT_COMPONENT_COUNT)
    : null;
  const scalarAttributes = new Map(
    payload.scalarFields.map((field) => [
      field.name,
      new THREE.InstancedBufferAttribute(field.values, 1),
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
  if (colorAttribute) geometry.setAttribute("projectionColor", colorAttribute);
  attachScalarAttributes(geometry, scalarAttributes);
  geometry.setAttribute("projectionSourceIndex", sourceIndexAttribute);

  totalResourceAllocations += 1;
  return {
    capacity: payload.capacity,
    colorAttribute,
    contentKey,
    disposed: false,
    frameUpdateCount: 0,
    geometry,
    positionAttribute,
    retired: false,
    retainCount: 0,
    sampledPointCount: normalizedSampleCount(payload),
    scalarAttributes,
    sourceIndexAttribute,
    sourceIndices: payload.sourceIndices,
    streamKey,
  };
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

  if (payload.colors) {
    if (!resource.colorAttribute) {
      resource.colorAttribute = new THREE.InstancedBufferAttribute(
        payload.colors,
        POINT_COMPONENT_COUNT,
      );
      resource.geometry.setAttribute(
        "projectionColor",
        resource.colorAttribute,
      );
    } else {
      replaceAttributeArray(resource.colorAttribute, payload.colors);
    }
  } else if (resource.colorAttribute) {
    resource.geometry.deleteAttribute("projectionColor");
    resource.colorAttribute = null;
  }

  // Scalar attribute slot numbers are derived from Map iteration order. Clear
  // every old slot before reattaching so removed/reordered fields cannot leave
  // a stale geometry binding at projectionScalarN.
  const previousScalarCount = resource.scalarAttributes.size;
  const currentScalarNames = new Set(
    payload.scalarFields.map((field) => field.name),
  );
  for (const name of resource.scalarAttributes.keys()) {
    if (!currentScalarNames.has(name)) {
      resource.scalarAttributes.delete(name);
    }
  }
  for (const field of payload.scalarFields) {
    const attribute = resource.scalarAttributes.get(field.name);
    if (attribute) {
      replaceAttributeArray(attribute, field.values);
    } else {
      resource.scalarAttributes.set(
        field.name,
        new THREE.InstancedBufferAttribute(field.values, 1),
      );
    }
  }
  for (
    let index = 0;
    index < Math.max(previousScalarCount, resource.scalarAttributes.size);
    index++
  ) {
    resource.geometry.deleteAttribute(`projectionScalar${index}`);
  }
  attachScalarAttributes(resource.geometry, resource.scalarAttributes);

  resource.contentKey = contentKey;
  resource.sampledPointCount = normalizedSampleCount(payload);
  resource.frameUpdateCount += 1;
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
  attributes: ReadonlyMap<string, THREE.InstancedBufferAttribute>,
): void {
  let index = 0;
  for (const attribute of attributes.values()) {
    geometry.setAttribute(`projectionScalar${index++}`, attribute);
  }
}

function normalizedSampleCount(payload: PointCloudRenderPayload): number {
  return Math.min(
    payload.capacity,
    Math.max(0, Math.floor(payload.sampledPointCount)),
  );
}

function touchEntry(key: string, entry: ProjectionResourceEntry): void {
  entries.delete(key);
  entries.set(key, entry);
}

function scheduleEviction(): void {
  if (
    evictionScheduled ||
    entries.size <= GPU_PROJECTION_RESOURCE_RETENTION_CAP
  ) {
    return;
  }
  evictionScheduled = true;
  // Defer LRU eviction until React layout effects have had a chance to retain
  // resources created during the current commit.
  queueMicrotask(() => {
    evictionScheduled = false;
    while (entries.size > GPU_PROJECTION_RESOURCE_RETENTION_CAP) {
      let evicted = false;
      for (const [key, entry] of entries) {
        if (entry.resource.retainCount !== 0) continue;
        entries.delete(key);
        disposeResource(entry.resource);
        evicted = true;
        break;
      }
      if (!evicted) break;
    }
  });
}

function scheduleRetiredDisposal(): void {
  // Retirement and final lease release can occur in either order. A microtask
  // coalesces both and disposes only resources no committed scene still pins.
  queueMicrotask(() => {
    for (const resource of retiredResources) {
      if (resource.retainCount !== 0) continue;
      retiredResources.delete(resource);
      disposeResource(resource);
    }
  });
}

function disposeResource(resource: InternalProjectionResource): void {
  if (resource.disposed) return;
  resource.disposed = true;
  resource.geometry.dispose();
}
