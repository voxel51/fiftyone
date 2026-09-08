import { describe, expect, it } from "vitest";

import { VISUALIZATION_KIND } from "../../../../visualization";
import { resolveCameraModel, type CameraModel } from "./camera-model";
import { resolveRectifiedImageDisplay } from "./image-rectification";

const original: CameraModel = {
  D: [0.1, 0, 0, 0, 0, 0, 0, 0],
  height: 100,
  K: [100, 0, 50, 0, 100, 50, 0, 0, 1],
  kind: "rational-polynomial",
  maxRadius: 1,
  space: "original",
  width: 100,
};
const rectified: CameraModel = {
  height: 100,
  kind: "pinhole",
  projection: [100, 0, 50, 20, 0, 100, 50, 0, 0, 0, 1, 0],
  rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  space: "rectified",
  width: 100,
};

describe("episode rectified image display", () => {
  it("builds and caches a rectified texture mesh", () => {
    const first = resolveRectifiedImageDisplay(original, rectified);
    const second = resolveRectifiedImageDisplay(original, rectified);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first?.textureMesh.indices.length).toBeGreaterThan(0);
    expect(first?.textureMesh.displayWidth).toBe(100);
    expect(first?.textureMesh.displayHeight).toBe(100);
  });

  it("transforms source annotations without applying stereo translation", () => {
    const display = resolveRectifiedImageDisplay(original, rectified);
    expect(display?.pixelTransform(50, 50)).toEqual([50, 50]);
    expect(display?.projectionModel.projection[3]).toBe(20);
  });

  it("refuses rectification when the recorded image is already rectified", () => {
    expect(resolveRectifiedImageDisplay(rectified, rectified)).toBeNull();
  });

  it("rectifies and transforms annotations in adapted image pixels", () => {
    const calibration = {
      D: [0, 0, 0, 0, 0],
      distortionModel: "plumb_bob",
      height: 100,
      K: [100, 0, 100, 0, 100, 50, 0, 0, 1],
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      P: [100, 0, 100, 20, 0, 100, 50, 10, 0, 0, 1, 0],
      R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      width: 200,
    };
    const imageDimensions = { height: 50, width: 100 };
    const source = resolveCameraModel({
      calibration,
      geometry: "original",
      imageDimensions,
      imageSourceName: "/camera/image_raw",
    });
    const target = resolveCameraModel({
      calibration,
      geometry: "rectified",
      imageDimensions,
      imageSourceName: "/camera/image_raw",
    });

    expect(source.status).toBe("ready");
    expect(target.status).toBe("ready");
    if (source.status !== "ready" || target.status !== "ready") {
      throw new Error("Expected adapted source and target models");
    }
    const display = resolveRectifiedImageDisplay(source.model, target.model);
    expect(display).not.toBeNull();
    expect(display?.textureMesh.displayWidth).toBe(100);
    expect(display?.textureMesh.displayHeight).toBe(50);
    expect(display?.pixelTransform(50, 25)).toEqual([50, 25]);
    expect(display?.projectionModel.projection[3]).toBe(10);
    expect(display?.projectionModel.projection[7]).toBe(5);
  });
});
