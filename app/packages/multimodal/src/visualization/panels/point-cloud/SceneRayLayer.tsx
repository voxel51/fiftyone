/* eslint-disable react/no-unknown-property */
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { pointCloudObjectTransform } from "./transforms";
import type { SceneRayPanelLayer } from "./types";
import { useInvalidateOn } from "./use-invalidate-on";

const DEFAULT_RAY_COLOR = 0x38d6ff;
const ENDPOINT_SIZE_PX = 8;
const RAY_RENDER_ORDER = 9_500;
const NOOP_RAYCAST = () => undefined;

/** Renders a transient source-frame ray without participating in scene picking. */
export function SceneRayLayer({
  layer,
}: {
  readonly layer: SceneRayPanelLayer;
}) {
  const objectTransform = useMemo(
    () => pointCloudObjectTransform(layer.frameTransform),
    [layer.frameTransform],
  );
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...layer.start, ...layer.end], 3),
    );
    return geometry;
  }, [layer.end, layer.start]);
  const endpointGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3),
    );
    return geometry;
  }, []);
  const color = layer.color ?? DEFAULT_RAY_COLOR;
  useInvalidateOn([color, layer.end, layer.start, objectTransform]);

  // This effect disposes the prior line geometry when the ray moves.
  useEffect(() => () => lineGeometry.dispose(), [lineGeometry]);

  // This effect disposes the stable endpoint geometry on unmount.
  useEffect(() => () => endpointGeometry.dispose(), [endpointGeometry]);

  return (
    <group
      position={objectTransform.position}
      quaternion={objectTransform.quaternion}
      renderOrder={RAY_RENDER_ORDER}
    >
      <lineSegments
        frustumCulled={false}
        raycast={NOOP_RAYCAST}
        renderOrder={RAY_RENDER_ORDER}
      >
        <primitive attach="geometry" object={lineGeometry} />
        <lineBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          transparent
        />
      </lineSegments>
      <points
        frustumCulled={false}
        position={layer.end}
        raycast={NOOP_RAYCAST}
        renderOrder={RAY_RENDER_ORDER}
      >
        <primitive attach="geometry" object={endpointGeometry} />
        <pointsMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          size={ENDPOINT_SIZE_PX}
          sizeAttenuation={false}
          transparent
        />
      </points>
    </group>
  );
}
