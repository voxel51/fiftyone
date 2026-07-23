import * as THREE from "three";

import type {
  PreparedImageAnnotationPicks,
  PreparedImageAnnotationPoints,
  PreparedImageAnnotations,
  PreparedImageAnnotationSegments,
} from "./gpu-image-annotation-preparation";

/** Base plus highlight storage for up to twelve active/recent image tiles. */
const RESOURCE_RETENTION_CAP = 24;

/** Stable GPU storage shared by visible and pick annotation passes. */
export interface GpuImageAnnotationResource {
  readonly pick: GpuImageAnnotationPickResource;
  readonly points: GpuImageAnnotationPointResource;
  /** Increments when new frame data is copied into the stable buffers. */
  revision: number;
  readonly segments: GpuImageAnnotationSegmentResource;
}

/** GPU attributes for the instanced point and circle batch. */
export interface GpuImageAnnotationPointResource {
  readonly centerAttribute: THREE.InstancedBufferAttribute;
  readonly colorAttribute: THREE.InstancedBufferAttribute;
  count: number;
  readonly diameterAttribute: THREE.InstancedBufferAttribute;
  readonly geometry: THREE.PlaneGeometry;
  readonly kindAttribute: THREE.InstancedBufferAttribute;
  readonly thicknessAttribute: THREE.InstancedBufferAttribute;
}

/** GPU attributes for the instanced line-segment batch. */
export interface GpuImageAnnotationSegmentResource {
  readonly colorAttribute: THREE.InstancedBufferAttribute;
  count: number;
  readonly endAttribute: THREE.InstancedBufferAttribute;
  readonly geometry: THREE.PlaneGeometry;
  readonly startAttribute: THREE.InstancedBufferAttribute;
  readonly thicknessAttribute: THREE.InstancedBufferAttribute;
}

/** GPU attributes for analytic pick candidates. */
export interface GpuImageAnnotationPickResource {
  readonly aAttribute: THREE.InstancedBufferAttribute;
  readonly bAttribute: THREE.InstancedBufferAttribute;
  readonly cAttribute: THREE.InstancedBufferAttribute;
  count: number;
  readonly geometry: THREE.PlaneGeometry;
  readonly kindAttribute: THREE.InstancedBufferAttribute;
  readonly orderAttribute: THREE.InstancedBufferAttribute;
  readonly primitiveIndexAttribute: THREE.InstancedBufferAttribute;
  readonly radiusAttribute: THREE.InstancedBufferAttribute;
}

interface InternalResource extends GpuImageAnnotationResource {
  disposed: boolean;
  payload: PreparedImageAnnotations;
  pickCapacity: number;
  pointCapacity: number;
  retired: boolean;
  retainCount: number;
  segmentCapacity: number;
}

const entries = new Map<string, InternalResource>();
const retiredResources = new Set<InternalResource>();
let evictionScheduled = false;

/**
 * Returns reusable, grow-only annotation attributes for one image tile.
 * Prepared frame arrays are copied once into stable storage shared by the
 * visible and integer-pick passes.
 */
export function getGpuImageAnnotationResource(
  key: string,
  payload: PreparedImageAnnotations,
): GpuImageAnnotationResource {
  let resource = entries.get(key);
  if (!resource) {
    resource = createResource(payload);
    entries.set(key, resource);
    scheduleEviction();
    return resource;
  }

  touch(key, resource);
  if (
    payload.points.count > resource.pointCapacity ||
    payload.segments.count > resource.segmentCapacity ||
    payload.picks.count > resource.pickCapacity
  ) {
    resource.retired = true;
    retiredResources.add(resource);
    resource = createResource(payload);
    entries.set(key, resource);
    scheduleRetiredDisposal();
    return resource;
  }

  if (resource.payload !== payload) {
    updateResource(resource, payload);
  }
  return resource;
}

/** Pins attributes while a committed R3F scene or picker references them. */
export function retainGpuImageAnnotationResource(
  resource: GpuImageAnnotationResource,
): () => void {
  const internal = resource as InternalResource;
  if (internal.disposed) return () => undefined;
  internal.retainCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    internal.retainCount = Math.max(0, internal.retainCount - 1);
    if (internal.retired) scheduleRetiredDisposal();
    else scheduleEviction();
  };
}

function releaseGpuImageAnnotationResources(): void {
  for (const resource of entries.values()) disposeResource(resource);
  for (const resource of retiredResources) disposeResource(resource);
  entries.clear();
  retiredResources.clear();
  evictionScheduled = false;
}

/** Clears all retained resources and counters between unit tests. */
export function resetGpuImageAnnotationResourcesForTests(): void {
  releaseGpuImageAnnotationResources();
}

function createResource(payload: PreparedImageAnnotations): InternalResource {
  const pointCapacity = nextCapacity(payload.points.count);
  const segmentCapacity = nextCapacity(payload.segments.count);
  const pickCapacity = nextCapacity(payload.picks.count);
  const points = createPointResource(pointCapacity);
  const segments = createSegmentResource(segmentCapacity);
  const pick = createPickResource(pickCapacity);
  const resource: InternalResource = {
    disposed: false,
    payload,
    pick,
    pickCapacity,
    pointCapacity,
    points,
    retired: false,
    retainCount: 0,
    revision: 0,
    segmentCapacity,
    segments,
  };
  copyPoints(points, payload.points);
  copySegments(segments, payload.segments);
  copyPicks(pick, payload.picks);
  return resource;
}

function updateResource(
  resource: InternalResource,
  payload: PreparedImageAnnotations,
): void {
  copyPoints(resource.points, payload.points);
  copySegments(resource.segments, payload.segments);
  copyPicks(resource.pick, payload.picks);
  resource.payload = payload;
  resource.revision += 1;
}

function createPointResource(
  capacity: number,
): GpuImageAnnotationPointResource {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const centerAttribute = attribute(new Float32Array(capacity * 2), 2);
  const colorAttribute = attribute(new Float32Array(capacity * 3), 3);
  const diameterAttribute = attribute(new Float32Array(capacity), 1);
  const kindAttribute = attribute(new Float32Array(capacity), 1);
  const thicknessAttribute = attribute(new Float32Array(capacity), 1);
  geometry.setAttribute("annotationPointCenter", centerAttribute);
  geometry.setAttribute("annotationPointColor", colorAttribute);
  geometry.setAttribute("annotationPointDiameter", diameterAttribute);
  geometry.setAttribute("annotationPointKind", kindAttribute);
  geometry.setAttribute("annotationPointThickness", thicknessAttribute);
  return {
    centerAttribute,
    colorAttribute,
    count: 0,
    diameterAttribute,
    geometry,
    kindAttribute,
    thicknessAttribute,
  };
}

function createSegmentResource(
  capacity: number,
): GpuImageAnnotationSegmentResource {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const colorAttribute = attribute(new Float32Array(capacity * 3), 3);
  const endAttribute = attribute(new Float32Array(capacity * 2), 2);
  const startAttribute = attribute(new Float32Array(capacity * 2), 2);
  const thicknessAttribute = attribute(new Float32Array(capacity), 1);
  geometry.setAttribute("annotationSegmentColor", colorAttribute);
  geometry.setAttribute("annotationSegmentEnd", endAttribute);
  geometry.setAttribute("annotationSegmentStart", startAttribute);
  geometry.setAttribute("annotationSegmentThickness", thicknessAttribute);
  return {
    colorAttribute,
    count: 0,
    endAttribute,
    geometry,
    startAttribute,
    thicknessAttribute,
  };
}

function createPickResource(capacity: number): GpuImageAnnotationPickResource {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const aAttribute = attribute(new Float32Array(capacity * 2), 2);
  const bAttribute = attribute(new Float32Array(capacity * 2), 2);
  const cAttribute = attribute(new Float32Array(capacity * 2), 2);
  const kindAttribute = attribute(new Float32Array(capacity), 1);
  const orderAttribute = attribute(new Float32Array(capacity), 1);
  const primitiveIndexAttribute = attribute(new Uint32Array(capacity), 1);
  const radiusAttribute = attribute(new Float32Array(capacity), 1);
  geometry.setAttribute("annotationPickA", aAttribute);
  geometry.setAttribute("annotationPickB", bAttribute);
  geometry.setAttribute("annotationPickC", cAttribute);
  geometry.setAttribute("annotationPickKind", kindAttribute);
  geometry.setAttribute("annotationPickOrder", orderAttribute);
  geometry.setAttribute(
    "annotationPickPrimitiveIndex",
    primitiveIndexAttribute,
  );
  geometry.setAttribute("annotationPickRadius", radiusAttribute);
  return {
    aAttribute,
    bAttribute,
    cAttribute,
    count: 0,
    geometry,
    kindAttribute,
    orderAttribute,
    primitiveIndexAttribute,
    radiusAttribute,
  };
}

function copyPoints(
  resource: GpuImageAnnotationPointResource,
  points: PreparedImageAnnotationPoints,
): void {
  copy(resource.centerAttribute, points.centers);
  copy(resource.colorAttribute, points.colors);
  copy(resource.diameterAttribute, points.diameters);
  copy(resource.kindAttribute, points.kinds);
  copy(resource.thicknessAttribute, points.thicknesses);
  resource.count = points.count;
}

function copySegments(
  resource: GpuImageAnnotationSegmentResource,
  segments: PreparedImageAnnotationSegments,
): void {
  copy(resource.colorAttribute, segments.colors);
  copy(resource.endAttribute, segments.ends);
  copy(resource.startAttribute, segments.starts);
  copy(resource.thicknessAttribute, segments.thicknesses);
  resource.count = segments.count;
}

function copyPicks(
  resource: GpuImageAnnotationPickResource,
  picks: PreparedImageAnnotationPicks,
): void {
  copy(resource.aAttribute, picks.a);
  copy(resource.bAttribute, picks.b);
  copy(resource.cAttribute, picks.c);
  copy(resource.kindAttribute, picks.kinds);
  copy(resource.orderAttribute, picks.orders);
  copy(resource.primitiveIndexAttribute, picks.primitiveIndices);
  copy(resource.radiusAttribute, picks.radii);
  resource.count = picks.count;
}

function attribute(
  array: Float32Array | Uint32Array,
  itemSize: number,
): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(array, itemSize).setUsage(
    THREE.DynamicDrawUsage,
  );
}

function copy(
  attribute: THREE.InstancedBufferAttribute,
  source: Float32Array | Uint32Array,
): void {
  (attribute.array as Float32Array | Uint32Array).set(source);
  attribute.needsUpdate = true;
}

function nextCapacity(count: number): number {
  let capacity = 1;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function touch(key: string, resource: InternalResource): void {
  entries.delete(key);
  entries.set(key, resource);
}

function scheduleEviction(): void {
  if (evictionScheduled || entries.size <= RESOURCE_RETENTION_CAP) return;
  evictionScheduled = true;
  queueMicrotask(() => {
    evictionScheduled = false;
    while (entries.size > RESOURCE_RETENTION_CAP) {
      let evicted = false;
      for (const [key, resource] of entries) {
        if (resource.retainCount !== 0) continue;
        entries.delete(key);
        disposeResource(resource);
        evicted = true;
        break;
      }
      if (!evicted) break;
    }
  });
}

function scheduleRetiredDisposal(): void {
  queueMicrotask(() => {
    for (const resource of retiredResources) {
      if (resource.retainCount !== 0) continue;
      retiredResources.delete(resource);
      disposeResource(resource);
    }
  });
}

function disposeResource(resource: InternalResource): void {
  if (resource.disposed) return;
  resource.disposed = true;
  resource.points.geometry.dispose();
  resource.segments.geometry.dispose();
  resource.pick.geometry.dispose();
}
