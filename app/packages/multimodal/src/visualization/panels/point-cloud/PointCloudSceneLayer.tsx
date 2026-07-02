/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
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

function PointCloudPoints({
  data,
  pointSize,
}: {
  readonly data: PointCloudRenderData;
  readonly pointSize: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const geometry = useMemo(() => createPointCloudGeometry(data), [data]);

  // This effect requests a repaint when point geometry changes and disposes the
  // old GPU geometry on cleanup.
  useEffect(() => {
    invalidate();
    return () => geometry.dispose();
  }, [geometry, invalidate]);

  return (
    <points frustumCulled={false}>
      <primitive attach="geometry" object={geometry} />
      <pointsMaterial size={pointSize} sizeAttenuation={false} vertexColors />
    </points>
  );
}

function createPointCloudGeometry(data: PointCloudRenderData) {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    data.positions,
    POINT_COMPONENT_COUNT,
  );
  const colorAttribute = new THREE.BufferAttribute(
    data.colors,
    POINT_COMPONENT_COUNT,
  );
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("color", colorAttribute);
  geometry.setDrawRange(0, data.renderedPointCount);
  geometry.boundingBox = data.bounds.clone();
  geometry.boundingSphere = data.bounds.getBoundingSphere(new THREE.Sphere());

  return geometry;
}
