/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { instancedBufferAttribute } from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import { POINT_COMPONENT_COUNT } from "./point-cloud-colors";
import { pointCloudObjectTransform } from "./transforms";
import type { PointCloudPanelLayer, PointCloudRenderData } from "./types";

// Default point sprite size in pixels. Lives here (not in the panel) so
// the offscreen snapshot renderer can share it without importing the
// panel's WebGPU canvas dependency graph.
export const DEFAULT_POINT_SIZE = 2;
export const POINT_CLOUD_POINTS_MATERIAL_PROPS = {
  sizeAttenuation: false,
  vertexColors: true,
} as const;

export const WEBGPU_POINT_PRIMITIVE_SIZE_PX = 1;
const NOOP_RAYCAST = () => undefined;

export interface PointCloudInstanceAttributes {
  readonly color: THREE.InstancedBufferAttribute;
  readonly position: THREE.InstancedBufferAttribute;
}

export function PointCloudSceneLayer({
  data,
  layer,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly layer: PointCloudPanelLayer;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { frameTransform } = layer;
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(frameTransform),
    [frameTransform],
  );

  // This effect requests a frameloop-on-demand repaint when the layer's
  // placement changes.
  useEffect(() => {
    invalidate();
  }, [invalidate, objectTransform]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
    >
      <PointCloudPoints data={data} pointSize={pointSize} />
    </group>
  );
}

// Small clouds (radar sweeps) share one bucket so per-tick count jitter
// never reallocates their geometry.
const MIN_POINT_CAPACITY = 1_024;

function PointCloudPoints({
  data,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  // Grow-only capacity in power-of-two buckets: playback ticks fluctuate a
  // few points around a stable count, and a boundary-straddling count must
  // not thrash between two buckets.
  const capacityRef = useRef(0);
  const requiredPoints = Math.ceil(
    data.positions.length / POINT_COMPONENT_COUNT,
  );
  if (requiredPoints > capacityRef.current) {
    capacityRef.current = Math.max(
      MIN_POINT_CAPACITY,
      2 ** Math.ceil(Math.log2(Math.max(1, requiredPoints))),
    );
  }
  const capacity = capacityRef.current;
  const geometry = useMemo(
    () => createPointCloudGeometry(capacity),
    [capacity],
  );

  // This layout effect copies each tick's points into the persistent
  // geometry before the next paint. Reusing one geometry per points object
  // (instead of swapping in a fresh one per tick) keeps the render-object ↔
  // geometry pairing stable and replaces per-tick GPU buffer create/destroy
  // churn with in-place writes.
  useLayoutEffect(() => {
    applyPointCloudData(geometry, data);
    invalidate();
  }, [data, geometry, invalidate]);

  // This effect disposes the GPU geometry when capacity grows or on unmount.
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Keying by capacity retires the points object together with its
  // geometry, so a geometry is never swapped into a live three object.
  return (
    <points key={capacity} frustumCulled={false}>
      <primitive attach="geometry" object={geometry} />
      <pointsMaterial {...POINT_CLOUD_POINTS_MATERIAL_PROPS} size={pointSize} />
      {pointSize > WEBGPU_POINT_PRIMITIVE_SIZE_PX ? (
        <PointCloudSizedSprites
          capacity={capacity}
          data={data}
          pointSize={pointSize}
        />
      ) : null}
    </points>
  );
}

function PointCloudSizedSprites({
  capacity,
  data,
  pointSize,
}: {
  readonly capacity: number;
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const attributes = useMemo(
    () => createPointCloudInstanceAttributes(capacity),
    [capacity],
  );
  const material = useMemo(
    () => createPointCloudSpriteMaterial(attributes, pointSize),
    [attributes, pointSize],
  );
  const sprite = useMemo(() => {
    const instanceSprite = new THREE.Sprite(
      material as unknown as THREE.SpriteMaterial,
    );
    instanceSprite.frustumCulled = false;
    instanceSprite.raycast = NOOP_RAYCAST;
    return instanceSprite;
  }, [material]);

  useLayoutEffect(() => {
    applyPointCloudInstanceData(attributes, data);
    sprite.count = data.renderedPointCount;
    invalidate();
  }, [attributes, data, invalidate, sprite]);

  useEffect(
    () => () => {
      material.dispose();
    },
    [material],
  );

  return <primitive key={capacity} object={sprite} />;
}

export function createPointCloudSpriteMaterial(
  attributes: PointCloudInstanceAttributes,
  pointSize: number,
) {
  const material = new PointsNodeMaterial({
    size: pointSize,
    sizeAttenuation: false,
  });
  material.colorNode = instancedBufferAttribute(attributes.color, "vec3");
  material.positionNode = instancedBufferAttribute(attributes.position, "vec3");
  return material;
}

/**
 * Builds the persistent point-cloud geometry at a fixed point capacity.
 * Shared with the offscreen snapshot renderer so live and snapshot paths
 * produce byte-identical geometry (static usage, capacity-sized buffers).
 */
export function createPointCloudGeometry(capacityPoints: number) {
  const geometry = new THREE.BufferGeometry();
  // Default (static) usage on purpose: the WebGPU backend re-uploads the
  // full array on every render for DynamicDrawUsage, while static usage
  // uploads only when a version bump (needsUpdate) says the data changed.
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
    POINT_COMPONENT_COUNT,
  );
  const colorAttribute = new THREE.BufferAttribute(
    new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
    POINT_COMPONENT_COUNT,
  );
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setDrawRange(0, 0);

  return geometry;
}

export function createPointCloudInstanceAttributes(
  capacityPoints: number,
): PointCloudInstanceAttributes {
  return {
    color: new THREE.InstancedBufferAttribute(
      new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
      POINT_COMPONENT_COUNT,
    ),
    position: new THREE.InstancedBufferAttribute(
      new Float32Array(capacityPoints * POINT_COMPONENT_COUNT),
      POINT_COMPONENT_COUNT,
    ),
  };
}

/**
 * Copies one frame's render data into the persistent geometry (in-place
 * writes, update ranges, draw range, bounds). Shared with the snapshot
 * renderer for the same reason as {@link createPointCloudGeometry}.
 */
export function applyPointCloudData(
  geometry: THREE.BufferGeometry,
  data: PointCloudRenderData,
) {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const color = geometry.getAttribute("color") as THREE.BufferAttribute;
  (position.array as Float32Array).set(data.positions);
  (color.array as Float32Array).set(data.colors);
  markAttributeUpdated(position, data.positions.length);
  markAttributeUpdated(color, data.colors.length);
  geometry.setDrawRange(0, data.renderedPointCount);
  geometry.boundingBox = data.bounds.clone();
  geometry.boundingSphere = data.bounds.getBoundingSphere(new THREE.Sphere());
}

export function applyPointCloudInstanceData(
  attributes: PointCloudInstanceAttributes,
  data: PointCloudRenderData,
) {
  (attributes.position.array as Float32Array).set(data.positions);
  (attributes.color.array as Float32Array).set(data.colors);
  markAttributeUpdated(attributes.position, data.positions.length);
  markAttributeUpdated(attributes.color, data.colors.length);
}

function markAttributeUpdated(
  attribute: THREE.BufferAttribute,
  componentCount: number,
) {
  // An empty tick draws nothing (draw range 0), so skip the GPU write: with
  // no update range, the backend would upload the entire capacity array.
  if (componentCount === 0) {
    return;
  }
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, componentCount);
  attribute.needsUpdate = true;
}
