import { afterEach, describe, expect, it } from "vitest";

import type { PreparedImageAnnotations } from "./gpu-image-annotation-preparation";
import {
  createGpuImageAnnotationPointMaterial,
  createGpuImageAnnotationSegmentMaterial,
} from "./GpuImageAnnotationLayer";
import {
  getGpuImageAnnotationResource,
  resetGpuImageAnnotationResourcesForTests,
} from "./gpu-image-annotation-resources";

afterEach(() => resetGpuImageAnnotationResourcesForTests());

describe("GPU image annotation layer", () => {
  it("uses scale-then-rotate sprites for line segments", () => {
    const resource = getGpuImageAnnotationResource("tile", payload());
    const pointMaterial = createGpuImageAnnotationPointMaterial(
      resource.points,
    );
    const segmentMaterial = createGpuImageAnnotationSegmentMaterial(
      resource.segments,
    );

    expect(pointMaterial.material.positionNode).not.toBeNull();
    expect(pointMaterial.material.sizeNode).not.toBeNull();
    expect(pointMaterial.material.fragmentNode).not.toBeNull();
    expect(segmentMaterial.material.positionNode).not.toBeNull();
    expect(segmentMaterial.material.rotationNode).not.toBeNull();
    expect(segmentMaterial.material.scaleNode).not.toBeNull();
    expect(segmentMaterial.material.fragmentNode).not.toBeNull();
    expect(
      (
        segmentMaterial.material as unknown as {
          readonly isSpriteNodeMaterial?: boolean;
        }
      ).isSpriteNodeMaterial,
    ).toBe(true);
    pointMaterial.material.dispose();
    segmentMaterial.material.dispose();
  });
});

function payload(): PreparedImageAnnotations {
  return {
    metadata: [],
    picks: {
      a: new Float32Array(2),
      b: new Float32Array(2),
      c: new Float32Array(2),
      count: 1,
      kinds: new Float32Array(1),
      orders: new Float32Array(1),
      primitiveIndices: new Uint32Array(1),
      radii: new Float32Array(1),
    },
    pointOffsets: new Uint32Array(1),
    points: {
      centers: new Float32Array(2),
      colors: new Float32Array(3),
      count: 1,
      diameters: new Float32Array(1),
      kinds: new Float32Array(1),
      primitiveIndices: new Uint32Array(1),
      thicknesses: new Float32Array(1),
    },
    segmentOffsets: new Uint32Array(1),
    segments: {
      colors: new Float32Array(3),
      count: 1,
      ends: new Float32Array(2),
      primitiveIndices: new Uint32Array(1),
      starts: new Float32Array(2),
      thicknesses: new Float32Array(1),
    },
  };
}
