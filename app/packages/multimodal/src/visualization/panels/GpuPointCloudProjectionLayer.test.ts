import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../decoders";
import { createGpuPointCloudProjectionMaterial } from "./GpuPointCloudProjectionLayer";
import {
  getGpuPointCloudProjectionResource,
  resetGpuPointCloudProjectionResourcesForTests,
} from "./gpu-point-cloud-projection-resources";
import { resolveGpuPointCloudColor } from "./point-cloud/gpu-point-cloud-color";
import { releaseGpuPointCloudColormapTextures } from "./point-cloud/gpu-point-cloud-colormap-texture";

afterEach(() => {
  resetGpuPointCloudProjectionResourcesForTests();
  releaseGpuPointCloudColormapTextures();
});

describe("GPU pointcloud projection material", () => {
  it("binds prepared data, GPU color, and mutable projection uniforms", () => {
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([1, 0, 0]),
      positions: new Float32Array([0, 0, 1]),
    });
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "frame",
      payload,
      streamKey: "points",
    });
    const projectionMatrix = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const imageRect = new THREE.Vector4(0.1, 0.2, 0.9, 0.8);
    const shader = createGpuPointCloudProjectionMaterial({
      calibrationHeight: 480,
      calibrationWidth: 640,
      color: resolveGpuPointCloudColor(payload, { colorBy: "rgb" }),
      imageRect,
      projectionMatrix,
      resource,
    });

    expect(shader.material.positionNode).not.toBeNull();
    expect(shader.material.colorNode).not.toBeNull();
    expect(shader.material.fragmentNode).not.toBeNull();
    expect(shader.material.scaleNode).not.toBeNull();
    expect(shader.projectionMatrix.value).not.toBe(projectionMatrix);
    expect(shader.projectionMatrix.value.elements).toEqual(
      projectionMatrix.elements,
    );
    expect(shader.dimensions.value.toArray()).toEqual([640, 480]);
    expect(shader.imageRect.value).not.toBe(imageRect);
    expect(shader.imageRect.value.toArray()).toEqual([0.1, 0.2, 0.9, 0.8]);

    shader.material.dispose();
  });

  it("builds scalar-ramp color nodes from sampled scalar attributes", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([0, 0, 1, 0, 0, 2]),
      scalarFields: [{ name: "intensity", values: new Float32Array([10, 20]) }],
    });
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "frame",
      payload,
      streamKey: "points",
    });
    const shader = createGpuPointCloudProjectionMaterial({
      calibrationHeight: 1,
      calibrationWidth: 1,
      color: resolveGpuPointCloudColor(payload, { colorBy: "intensity" }),
      projectionMatrix: new THREE.Matrix4(),
      resource,
    });

    expect(shader.material.colorNode).not.toBeNull();
    shader.material.dispose();
  });
});
