import { describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../../runtime/point-cloud-render-payload";
import {
  buildPointCloudRenderData,
  type PointCloudColorOptions,
} from "../point-cloud-colors";
import {
  gpuPointCloudColorAtSample,
  NEUTRAL_GPU_POINT_COLOR,
  resolveGpuPointCloudColor,
} from "./gpu-point-cloud-color";

describe("GPU point-cloud colour resolution", () => {
  it.each(["intensity", "reflectivity", "reflectance", "rcs"])(
    "matches CPU auto-color policy for the canonical %s scalar",
    (fieldName) => {
      expectCpuGpuColorParity({
        positions: new Float32Array([0, 0, 10, 0, 0, 0]),
        scalarFields: [{ name: fieldName, values: new Float32Array([10, 20]) }],
      });
    },
  );

  it("matches CPU policy for RGB, height, uniform, and fixed ranges", () => {
    expectCpuGpuColorParity({
      colors: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]),
      positions: new Float32Array([0, 0, 0, 0, 0, 1]),
    });
    expectCpuGpuColorParity(
      { positions: new Float32Array([0, 0, 0, 0, 0, 1]) },
      { colorBy: "height" },
    );
    expectCpuGpuColorParity(
      { positions: new Float32Array([0, 0, 0, 0, 0, 1]) },
      { colorBy: "uniform", uniformColor: "#336699" },
    );
    expectCpuGpuColorParity(
      {
        positions: new Float32Array([0, 0, 0, 0, 0, 1]),
        scalarFields: [{ name: "intensity", values: new Float32Array([5, 5]) }],
      },
      { colorBy: "intensity", rangeMax: 10, rangeMin: 0 },
    );
  });

  it("matches CPU fallbacks for degenerate ranges and non-finite values", () => {
    expectCpuGpuColorParity({
      positions: new Float32Array([0, 0, 3, 1, 1, 3]),
      scalarFields: [{ name: "intensity", values: new Float32Array([5, 5]) }],
    });
    expectCpuGpuColorParity(
      {
        positions: new Float32Array([0, 0, 0, 0, 0, 1]),
        scalarFields: [
          { name: "intensity", values: new Float32Array([Number.NaN, 0.5]) },
        ],
      },
      { colorBy: "intensity", rangeMax: 1, rangeMin: 0 },
    );
  });

  it("prefers decoded RGB in auto mode", () => {
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([0.1, 0.2, 0.3]),
      positions: new Float32Array([1, 2, 3]),
    });
    const resolved = resolveGpuPointCloudColor(payload, { colorBy: "auto" });

    expect(resolved.source.kind).toBe("rgb");
    expect(gpuPointCloudColorAtSample(resolved, payload, 0)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
  });

  it("uses decoder scalar ranges without scanning full arrays", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([0, 0, 0, 1, 1, 1]),
      scalarFields: [{ name: "intensity", values: new Float32Array([10, 20]) }],
    });
    const resolved = resolveGpuPointCloudColor(payload, {
      colorBy: "intensity",
    });

    expect(resolved.source).toMatchObject({
      kind: "scalar",
      maxValue: 20,
      minValue: 10,
    });
    expect(resolved.colorRamp).toMatchObject({
      fieldLabel: "intensity",
      maxValue: 20,
      minValue: 10,
    });
  });

  it("honors fixed ranges and emits neutral color for non-finite samples", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([0, 0, 0]),
      scalarFields: [
        { name: "intensity", values: new Float32Array([Number.NaN]) },
      ],
    });
    const resolved = resolveGpuPointCloudColor(payload, {
      colorBy: "intensity",
      rangeMax: 1,
      rangeMin: 0,
    });

    expect(resolved.source.kind).toBe("scalar");
    expect(gpuPointCloudColorAtSample(resolved, payload, 0)).toEqual(
      NEUTRAL_GPU_POINT_COLOR,
    );
  });

  it("falls back to neutral when an explicit source is unavailable", () => {
    const payload = buildPointCloudRenderPayload({
      positions: new Float32Array([0, 0, 0]),
    });
    const resolved = resolveGpuPointCloudColor(payload, {
      colorBy: "missing-channel",
    });

    expect(resolved.source).toEqual({
      color: NEUTRAL_GPU_POINT_COLOR,
      kind: "uniform",
    });
  });
});

function expectCpuGpuColorParity(
  frame: {
    readonly colors?: Float32Array;
    readonly positions: Float32Array;
    readonly scalarFields?: readonly {
      readonly name: string;
      readonly values: Float32Array;
    }[];
  },
  options: PointCloudColorOptions = {},
): void {
  const cpu = buildPointCloudRenderData(frame.positions, 1_000, {
    ...options,
    colors: frame.colors,
    scalarFields: frame.scalarFields,
  });
  const payload = buildPointCloudRenderPayload(frame);
  const gpu = resolveGpuPointCloudColor(payload, options);

  expect(gpu.colorRamp).toEqual(cpu.colorRamp);
  for (let index = 0; index < payload.sampledPointCount; index++) {
    const gpuColor = gpuPointCloudColorAtSample(gpu, payload, index);
    expect(gpuColor).not.toBeNull();
    for (let component = 0; component < 3; component++) {
      expect(gpuColor?.[component]).toBeCloseTo(
        cpu.colors[index * 3 + component],
      );
    }
  }
}
