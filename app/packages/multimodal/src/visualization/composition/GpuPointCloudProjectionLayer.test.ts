import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../ir";
import { createGpuPointCloudProjectionMaterial } from "./GpuPointCloudProjectionLayer";
import {
  getGpuPointCloudProjectionResource,
  resetGpuPointCloudProjectionResourcesForTests,
} from "./gpu-point-cloud-projection-resources";
import { resolveGpuPointCloudColor } from "../scene-3d/gpu/gpu-point-cloud-color";
import { releaseGpuPointCloudColormapTextures } from "../scene-3d/gpu/gpu-point-cloud-colormap-texture";

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
      projection: { kind: "pinhole", projectionMatrix },
      resource,
    });

    expect(shader.material.positionNode).not.toBeNull();
    expect(shader.material.colorNode).not.toBeNull();
    expect(shader.material.fragmentNode).not.toBeNull();
    expect(shader.material.scaleNode).not.toBeNull();
    expect(shader.cameraProjection.kind).toBe("pinhole");
    if (shader.cameraProjection.kind !== "pinhole") {
      throw new Error("Expected pinhole projection bindings");
    }
    expect(shader.cameraProjection.projectionMatrix.value).not.toBe(
      projectionMatrix,
    );
    expect(shader.cameraProjection.projectionMatrix.value.elements).toEqual(
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
      projection: {
        kind: "pinhole",
        projectionMatrix: new THREE.Matrix4(),
      },
      resource,
    });

    expect(shader.material.colorNode).not.toBeNull();
    shader.material.dispose();
  });

  it.each(["rational-polynomial", "equidistant"] as const)(
    "builds shared %s camera-model nodes",
    (kind) => {
      const payload = buildPointCloudRenderPayload({
        positions: new Float32Array([0, 0, 1]),
      });
      const resource = getGpuPointCloudProjectionResource({
        contentKey: kind,
        payload,
        streamKey: kind,
      });
      const common = {
        cameraMatrix: new THREE.Matrix4(),
        intrinsicsX: new THREE.Vector4(100, 0, 50, 0),
        intrinsicsY: new THREE.Vector4(0, 100, 50, 0),
      };
      const projection =
        kind === "rational-polynomial"
          ? {
              ...common,
              distortionHigh: new THREE.Vector4(),
              distortionLow: new THREE.Vector4(-0.1, 0, 0, 0),
              kind,
              maxRadius: 1,
            }
          : {
              ...common,
              distortion: new THREE.Vector4(),
              kind,
              maxTheta: 2,
            };
      const shader = createGpuPointCloudProjectionMaterial({
        calibrationHeight: 100,
        calibrationWidth: 100,
        color: resolveGpuPointCloudColor(payload, {}),
        projection,
        resource,
      });

      expect(shader.cameraProjection.kind).toBe(kind);
      expect(shader.material.positionNode).not.toBeNull();
      expect(shader.material.scaleNode).not.toBeNull();
      shader.material.dispose();
    },
  );
});
