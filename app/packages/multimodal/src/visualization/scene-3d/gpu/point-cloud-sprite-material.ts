import * as THREE from "three";
import * as TSL from "three/tsl";
import { PointsNodeMaterial } from "three/webgpu";

import type { PointCloudSpriteTslFacade } from "../../tsl-chainables";

/** Instanced attributes shared by live and snapshot point-cloud sprites. */
export interface PointCloudInstanceAttributes {
  readonly color: THREE.InstancedBufferAttribute;
  readonly position: THREE.InstancedBufferAttribute;
}

/** Builds the shared point-sprite material without owning its disposal. */
export function createPointCloudSpriteMaterial(
  attributes: PointCloudInstanceAttributes,
  pointSize: number,
  circular = false,
) {
  const material = new PointsNodeMaterial({
    size: pointSize,
    sizeAttenuation: false,
  }) as PointsNodeMaterial & {
    colorNode: TSL.Node;
    fragmentNode: TSL.Node | null;
  };
  material.colorNode = TSL.instancedBufferAttribute(attributes.color, "vec3");
  material.positionNode = TSL.instancedBufferAttribute(
    attributes.position,
    "vec3",
  );
  if (circular) {
    const tsl: PointCloudSpriteTslFacade = TSL;
    material.fragmentNode = tsl.Fn(() => {
      const centeredPoint = tsl.uv().sub(0.5);
      const pointRadius = centeredPoint.length();
      tsl.Discard(pointRadius.greaterThan(0.5));
      return tsl.vec4(material.colorNode, 1);
    })();
  }
  return material;
}
