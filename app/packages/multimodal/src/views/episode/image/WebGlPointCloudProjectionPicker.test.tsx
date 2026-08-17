import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../../runtime/point-cloud-render-payload";
import type { GpuPointCloudProjectionPickerHandle } from "../../../visualization/composition/GpuPointCloudProjectionPicker";
import {
  WebGlPointCloudProjectionPicker,
  pickWebGlPointCloudProjection,
  type WebGlPointCloudProjectionPickerScene,
} from "./WebGlPointCloudProjectionPicker";

const cameraModel = {
  height: 100,
  kind: "pinhole" as const,
  projection: [50, 0, 50, 0, 0, 50, 50, 0, 0, 0, 1, 0],
  rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  space: "rectified" as const,
  width: 100,
};

describe("WebGL pointcloud projection picker", () => {
  it("picks the nearest rendered sampled point and preserves source identity", () => {
    const scene = pickerScene();
    const result = pickWebGlPointCloudProjection(scene, {
      radiusPx: 3,
      targetU: 60,
      targetV: 50,
    });

    expect(result).toEqual({
      layerIndex: 0,
      resourceKey: "frame",
      sampleIndex: 1,
      sourceIndex: scene.layers[0].payload.sourceIndices[1],
    });
  });

  it("does not pick samples outside the rendered prefix", () => {
    const scene = pickerScene(1);
    expect(
      pickWebGlPointCloudProjection(scene, {
        radiusPx: 3,
        targetU: 60,
        targetV: 50,
      }),
    ).toBeNull();
  });

  it("ignores sampled points without a valid source identity", () => {
    const shortMapping = pickerScene();
    Object.defineProperty(shortMapping.layers[0].payload, "sourceIndices", {
      value: new Uint32Array([0]),
    });
    expect(
      pickWebGlPointCloudProjection(shortMapping, {
        radiusPx: 3,
        targetU: 60,
        targetV: 50,
      }),
    ).toBeNull();

    const outOfBoundsMapping = pickerScene();
    Object.defineProperty(outOfBoundsMapping.layers[0], "sourcePointCount", {
      value: 1,
    });
    expect(
      pickWebGlPointCloudProjection(outOfBoundsMapping, {
        radiusPx: 3,
        targetU: 60,
        targetV: 50,
      }),
    ).toBeNull();
  });

  it("invalidates a queued result through the shared picker handle", async () => {
    const ref = createRef<GpuPointCloudProjectionPickerHandle>();
    render(<WebGlPointCloudProjectionPicker {...pickerScene()} ref={ref} />);

    const pending = ref.current?.pick({
      radiusPx: 3,
      targetU: 60,
      targetV: 50,
    });
    ref.current?.invalidate();

    await expect(pending).resolves.toBeNull();
    await expect(
      ref.current?.pick({ radiusPx: 3, targetU: 60, targetV: 50 }),
    ).resolves.toEqual({
      layerIndex: 0,
      resourceKey: "frame",
      sampleIndex: 1,
      sourceIndex: 1,
    });
  });
});

function pickerScene(
  renderedPointCount = 2,
): WebGlPointCloudProjectionPickerScene {
  return {
    cameraModel,
    layers: [
      {
        payload: buildPointCloudRenderPayload({
          positions: new Float32Array([0, 0, 5, 1, 0, 5]),
        }),
        renderedPointCount,
        resourceKey: "frame",
        rotation: { w: 1, x: 0, y: 0, z: 0 },
        sourcePointCount: 2,
        translation: { x: 0, y: 0, z: 0 },
      },
    ],
  };
}
