import { describe, expect, it } from "vitest";

import { buildPointCloudRenderPayload } from "../../../../decoders";
import {
  gpuPointCloudColorAtSample,
  NEUTRAL_GPU_POINT_COLOR,
  resolveGpuPointCloudColor,
} from "./gpu-point-cloud-color";

describe("GPU point-cloud colour resolution", () => {
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
