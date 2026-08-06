import * as THREE from "three";

import { createKeyedLeaseRegistry } from "../keyed-lease-registry";
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
  readonly revision: number;
  readonly segments: GpuImageAnnotationSegmentResource;
}

/** GPU attributes for the instanced point and circle batch. */
export interface GpuImageAnnotationPointResource {
  readonly centerAttribute: THREE.InstancedBufferAttribute;
  readonly colorAttribute: THREE.InstancedBufferAttribute;
  readonly count: number;
  readonly diameterAttribute: THREE.InstancedBufferAttribute;
  readonly geometry: THREE.PlaneGeometry;
  readonly kindAttribute: THREE.InstancedBufferAttribute;
  readonly thicknessAttribute: THREE.InstancedBufferAttribute;
}

/** GPU attributes for the instanced line-segment batch. */
export interface GpuImageAnnotationSegmentResource {
  readonly colorAttribute: THREE.InstancedBufferAttribute;
  readonly count: number;
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
  readonly count: number;
  readonly geometry: THREE.PlaneGeometry;
  readonly kindAttribute: THREE.InstancedBufferAttribute;
  readonly orderAttribute: THREE.InstancedBufferAttribute;
  readonly primitiveIndexAttribute: THREE.InstancedBufferAttribute;
  readonly radiusAttribute: THREE.InstancedBufferAttribute;
}

interface InternalPointResource extends GpuImageAnnotationPointResource {
  count: number;
}

interface InternalSegmentResource extends GpuImageAnnotationSegmentResource {
  count: number;
}

interface InternalPickResource extends GpuImageAnnotationPickResource {
  count: number;
}

interface InternalResource extends GpuImageAnnotationResource {
  payload: PreparedImageAnnotations;
  readonly pick: InternalPickResource;
  readonly pickCapacity: number;
  readonly pointCapacity: number;
  readonly points: InternalPointResource;
  revision: number;
  readonly segmentCapacity: number;
  readonly segments: InternalSegmentResource;
}

const imageAnnotationResourceRegistry = createKeyedLeaseRegistry<
  string,
  PreparedImageAnnotations,
  InternalResource
>({
  create: (_key, payload) => createResource(payload),
  dispose: disposeResource,
  needsGrowth: (resource, payload) =>
    payload.points.count > resource.pointCapacity ||
    payload.segments.count > resource.segmentCapacity ||
    payload.picks.count > resource.pickCapacity,
  retentionCap: RESOURCE_RETENTION_CAP,
  update: (resource, payload) => {
    if (resource.payload !== payload) updateResource(resource, payload);
  },
});

/**
 * Returns reusable, grow-only annotation attributes for one image tile.
 * Prepared frame arrays are copied once into stable storage shared by the
 * visible and integer-pick passes.
 */
export function getGpuImageAnnotationResource(
  key: string,
  payload: PreparedImageAnnotations,
): GpuImageAnnotationResource {
  return imageAnnotationResourceRegistry.get(key, payload);
}

/** Pins attributes while a committed R3F scene or picker references them. */
export function retainGpuImageAnnotationResource(
  resource: GpuImageAnnotationResource,
): () => void {
  return imageAnnotationResourceRegistry.retain(resource as InternalResource);
}

function releaseGpuImageAnnotationResources(): void {
  imageAnnotationResourceRegistry.releaseAll();
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
    payload,
    pick,
    pickCapacity,
    pointCapacity,
    points,
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

function createPointResource(capacity: number): InternalPointResource {
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

function createSegmentResource(capacity: number): InternalSegmentResource {
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

function createPickResource(capacity: number): InternalPickResource {
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
  resource: InternalPointResource,
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
  resource: InternalSegmentResource,
  segments: PreparedImageAnnotationSegments,
): void {
  copy(resource.colorAttribute, segments.colors);
  copy(resource.endAttribute, segments.ends);
  copy(resource.startAttribute, segments.starts);
  copy(resource.thicknessAttribute, segments.thicknesses);
  resource.count = segments.count;
}

function copyPicks(
  resource: InternalPickResource,
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

function disposeResource(resource: InternalResource): void {
  resource.points.geometry.dispose();
  resource.segments.geometry.dispose();
  resource.pick.geometry.dispose();
}
