/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { POINT_COMPONENT_COUNT } from "./point-cloud-colors";
import { pointCloudObjectTransform } from "./transforms";
import type { PointCloudPanelLayer, PointCloudRenderData } from "./types";

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
      <pointsMaterial size={pointSize} sizeAttenuation={false} vertexColors />
    </points>
  );
}

function createPointCloudGeometry(capacityPoints: number) {
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

function applyPointCloudData(
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
