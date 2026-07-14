import { describe, expect, it } from "vitest";

import type { RawImageVisualization } from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapCameraModel } from "./camera-geometry/mcap-camera-model";
import { mcapDepthSampleAtDisplayPixel } from "./mcap-depth-hover";

describe("mcap depth hover", () => {
  it("unprojects 16UC1 camera-Z depth without shortening off-axis rays", () => {
    const model = cameraModel({ height: 3, width: 3 });
    const frame = depthFrame(
      3,
      3,
      new Uint16Array([0, 0, 0, 0, 0, 2_000, 0, 0, 0]),
      0.001,
    );

    const sample = mcapDepthSampleAtDisplayPixel({
      displayCameraModel: model,
      frame,
      sourceCameraModel: model,
      u: 2,
      v: 1,
    });

    expect(sample).toEqual({
      depthMeters: 2,
      pixel: [2, 1],
      position: [0.02, 0, 2],
    });
  });

  it("maps rectified display pixels back into the retained source image", () => {
    const sourceCameraModel = cameraModel({ height: 3, width: 4 });
    const displayCameraModel = cameraModel({
      cx: 2,
      height: 3,
      width: 4,
    });
    const values = new Float32Array(12);
    values[5] = 3.5;

    const sample = mcapDepthSampleAtDisplayPixel({
      displayCameraModel,
      frame: depthFrame(4, 3, values, 1),
      sourceCameraModel,
      u: 2,
      v: 1,
    });

    expect(sample).toMatchObject({
      depthMeters: 3.5,
      pixel: [1, 1],
      position: [0, 0, 3.5],
    });
  });

  it("withholds zero, non-finite, and out-of-image depth samples", () => {
    const model = cameraModel({ height: 1, width: 3 });
    const frame = depthFrame(3, 1, new Float32Array([0, Number.NaN, 2]), 1);

    expect(
      mcapDepthSampleAtDisplayPixel({
        displayCameraModel: model,
        frame,
        sourceCameraModel: model,
        u: 0,
        v: 0,
      }),
    ).toBeNull();
    expect(
      mcapDepthSampleAtDisplayPixel({
        displayCameraModel: model,
        frame,
        sourceCameraModel: model,
        u: 1,
        v: 0,
      }),
    ).toBeNull();
    expect(
      mcapDepthSampleAtDisplayPixel({
        displayCameraModel: model,
        frame,
        sourceCameraModel: model,
        u: 3,
        v: 0,
      }),
    ).toBeNull();
  });
});

function cameraModel({
  cx = 1,
  height,
  width,
}: {
  readonly cx?: number;
  readonly height: number;
  readonly width: number;
}): McapCameraModel {
  return {
    height,
    kind: "pinhole",
    projection: [100, 0, cx, 0, 0, 100, 1, 0, 0, 0, 1, 0],
    rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    space: "original",
    width,
  };
}

function depthFrame(
  width: number,
  height: number,
  values: Uint16Array | Float32Array,
  metersPerUnit: number,
): RawImageVisualization {
  return {
    depth: { metersPerUnit, values },
    height,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(width * height * 4),
    sourceEncoding: values instanceof Uint16Array ? "16UC1" : "32FC1",
    width,
  };
}
