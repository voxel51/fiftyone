import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  gpuPointCloudProjectionResourceKey,
  gpuProjectionImagePlaneSize,
  gpuProjectionViewportRect,
  sensorToImageProjectionMatrix,
} from "./gpu-point-cloud-projection";

const IDENTITY_ROTATION = { w: 1, x: 0, y: 0, z: 0 };
const ZERO_TRANSLATION = { x: 0, y: 0, z: 0 };

describe("GPU pointcloud projection math", () => {
  it("composes camera intrinsics with a sensor transform", () => {
    const matrix = sensorToImageProjectionMatrix({
      calibration: {
        K: [100, 0, 320, 0, 200, 240, 0, 0, 1],
        height: 480,
        width: 640,
      },
      rotation: IDENTITY_ROTATION,
      translation: { x: 1, y: -1, z: 0 },
    });

    const homogeneous = new THREE.Vector4(1, 2, 10, 1).applyMatrix4(
      requireMatrix(matrix),
    );
    expect(homogeneous.x / homogeneous.z).toBeCloseTo(340);
    expect(homogeneous.y / homogeneous.z).toBeCloseTo(260);
  });

  it("normalizes quaternion rotations before composing them", () => {
    const matrix = sensorToImageProjectionMatrix({
      calibration: {
        K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        height: 100,
        width: 100,
      },
      // Non-unit quaternion for a 90-degree rotation around z.
      rotation: { w: 2, x: 0, y: 0, z: 2 },
      translation: ZERO_TRANSLATION,
    });

    const homogeneous = new THREE.Vector4(2, 0, 4, 1).applyMatrix4(
      requireMatrix(matrix),
    );
    expect(homogeneous.x).toBeCloseTo(0);
    expect(homogeneous.y).toBeCloseTo(2);
    expect(homogeneous.z).toBeCloseTo(4);
  });

  it("prefers the rectified projection matrix over K", () => {
    const matrix = sensorToImageProjectionMatrix({
      calibration: {
        K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        P: [2, 0, 10, 4, 0, 3, 20, 5, 0, 0, 1, 0],
        height: 100,
        width: 100,
      },
      rotation: IDENTITY_ROTATION,
      translation: ZERO_TRANSLATION,
    });

    const homogeneous = new THREE.Vector4(1, 2, 10, 1).applyMatrix4(
      requireMatrix(matrix),
    );
    expect(homogeneous.x).toBe(106);
    expect(homogeneous.y).toBe(211);
    expect(homogeneous.z).toBe(10);
  });

  it("rejects unusable calibration", () => {
    expect(
      sensorToImageProjectionMatrix({
        calibration: { K: [], height: 480, width: 640 },
        rotation: IDENTITY_ROTATION,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
    expect(
      sensorToImageProjectionMatrix({
        calibration: {
          K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          height: 0,
          width: 640,
        },
        rotation: IDENTITY_ROTATION,
        translation: ZERO_TRANSLATION,
      }),
    ).toBeNull();
  });

  it("matches the image scene's contain and cover plane sizes", () => {
    expect(
      gpuProjectionImagePlaneSize({
        containerHeight: 300,
        containerWidth: 400,
        fit: "contain",
        imageHeight: 100,
        imageWidth: 200,
      }),
    ).toEqual({ height: 200, width: 400 });
    expect(
      gpuProjectionImagePlaneSize({
        containerHeight: 300,
        containerWidth: 400,
        fit: "cover",
        imageHeight: 100,
        imageWidth: 200,
      }),
    ).toEqual({ height: 300, width: 600 });
  });

  it("normalizes a contained image rectangle into viewport UVs", () => {
    const rect = gpuProjectionViewportRect({
      containerHeight: 300,
      containerWidth: 400,
      fit: "contain",
      imageHeight: 100,
      imageWidth: 200,
    });

    expect(rect.left).toBe(0);
    expect(rect.right).toBe(1);
    expect(rect.top).toBeCloseTo(1 / 6);
    expect(rect.bottom).toBeCloseTo(5 / 6);
  });

  it("applies image zoom and pan before clipping to the viewport", () => {
    expect(
      gpuProjectionViewportRect({
        containerHeight: 300,
        containerWidth: 400,
        fit: "contain",
        imageHeight: 100,
        imageWidth: 200,
        viewTransform: { scale: 0.5, translateX: 20, translateY: -10 },
      }),
    ).toEqual({
      bottom: 190 / 300,
      left: 120 / 400,
      right: 320 / 400,
      top: 90 / 300,
    });

    expect(
      gpuProjectionViewportRect({
        containerHeight: 300,
        containerWidth: 400,
        fit: "cover",
        imageHeight: 100,
        imageWidth: 200,
        viewTransform: { scale: 2, translateX: 0, translateY: 0 },
      }),
    ).toEqual({ bottom: 1, left: 0, right: 1, top: 0 });
  });

  it("forms resource keys from recording, topic, and frame identity", () => {
    expect(gpuPointCloudProjectionResourceKey("recording", "/lidar", 42n)).toBe(
      "recording\n/lidar\n42",
    );
  });
});

function requireMatrix(matrix: THREE.Matrix4 | null): THREE.Matrix4 {
  if (!matrix) {
    throw new Error("Expected a usable projection matrix");
  }
  return matrix;
}
