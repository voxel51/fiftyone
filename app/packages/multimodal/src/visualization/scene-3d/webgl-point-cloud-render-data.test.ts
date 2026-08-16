import { describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../runtime/point-cloud-render-payload";
import {
  gpuPointCloudColorAtSample,
  resolveGpuPointCloudColor,
} from "./gpu/gpu-point-cloud-color";
import type { PointCloudColorOptions } from "./point-cloud-colors";
import { buildWebGlPointCloudRenderData } from "./webgl-point-cloud-render-data";

describe("buildWebGlPointCloudRenderData", () => {
  it("copies the canonical progressive prefix", () => {
    const positions = Float32Array.from(
      { length: 8 * 3 },
      (_, component) => Math.floor(component / 3) * 10 + (component % 3),
    );
    const payload = buildPointCloudRenderPayload({ positions });
    const color = resolveGpuPointCloudColor(payload, {
      colorBy: "uniform",
      uniformColor: "#336699",
    });
    const data = buildWebGlPointCloudRenderData({
      color,
      maxRenderedPoints: 3,
      payload,
    });

    expect(data.renderedPointCount).toBe(3);
    expect(data.positions).toEqual(payload.positions.slice(0, 9));
    expect(Array.from(data.colors)).toEqual([
      expect.closeTo(0.2),
      expect.closeTo(0.4),
      expect.closeTo(0.6),
      expect.closeTo(0.2),
      expect.closeTo(0.4),
      expect.closeTo(0.6),
      expect.closeTo(0.2),
      expect.closeTo(0.4),
      expect.closeTo(0.6),
    ]);
  });

  it.each([
    {
      name: "RGB",
      options: { colorBy: "rgb" } as PointCloudColorOptions,
      source: {
        colors: new Float32Array([1, 0, 0, 0, 0.5, 1]),
        positions: new Float32Array([0, 0, 0, 1, 1, 10]),
      },
    },
    {
      name: "height",
      options: { colorBy: "height" } as PointCloudColorOptions,
      source: {
        positions: new Float32Array([0, 0, 0, 1, 1, 10]),
      },
    },
    {
      name: "scalar",
      options: { colorBy: "intensity" } as PointCloudColorOptions,
      source: {
        positions: new Float32Array([0, 0, 0, 1, 1, 10]),
        scalarFields: [
          { name: "intensity", values: new Float32Array([5, 15]) },
        ],
      },
    },
  ])("matches the resolved $name colors", ({ options, source }) => {
    const payload = buildPointCloudRenderPayload(source);
    const color = resolveGpuPointCloudColor(payload, options);
    const data = buildWebGlPointCloudRenderData({
      color,
      maxRenderedPoints: Number.POSITIVE_INFINITY,
      payload,
    });

    for (let index = 0; index < data.renderedPointCount; index += 1) {
      const expected = gpuPointCloudColorAtSample(color, payload, index);
      expect(expected).not.toBeNull();
      for (let component = 0; component < 3; component += 1) {
        expect(data.colors[index * 3 + component]).toBeCloseTo(
          expected?.[component] ?? Number.NaN,
        );
      }
    }
    expect(data.colorRamp).toEqual(color.colorRamp);
  });

  it("preserves full finite bounds while expanding only the draw prefix", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([
        0,
        0,
        0,
        Number.NaN,
        2,
        3,
        10,
        20,
        30,
        -5,
        -10,
        -15,
      ]),
    });
    const data = buildWebGlPointCloudRenderData({
      color: resolveGpuPointCloudColor(payload, {}),
      maxRenderedPoints: 1,
      payload,
    });

    expect(data.renderedPointCount).toBe(1);
    expect(data.finitePointCount).toBe(3);
    expect(data.bounds.min.toArray()).toEqual([-5, -10, -15]);
    expect(data.bounds.max.toArray()).toEqual([10, 20, 30]);
  });

  it("returns safe bounds and empty attributes when no point is finite", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([Number.NaN, 0, 0]),
    });
    const data = buildWebGlPointCloudRenderData({
      color: resolveGpuPointCloudColor(payload, {}),
      maxRenderedPoints: 10,
      payload,
    });

    expect(data.renderedPointCount).toBe(0);
    expect(data.positions).toHaveLength(0);
    expect(data.colors).toHaveLength(0);
    expect(data.bounds.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(data.bounds.max.toArray()).toEqual([0.5, 0.5, 0.5]);
  });
});
