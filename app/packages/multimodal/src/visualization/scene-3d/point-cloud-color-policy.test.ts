import { describe, expect, it } from "vitest";

import {
  NEUTRAL_POINT_CLOUD_COLOR,
  normalizePointCloudColorValue,
  resolvePointCloudColorPolicy,
  resolvePointCloudFixedRange,
  type PointCloudColorRange,
} from "./point-cloud-color-policy";

const HEIGHT_RANGE: PointCloudColorRange = [0, 10];
const SCALAR_RANGE: PointCloudColorRange = [1, 3];
const UNIFORM_COLOR = [0.1, 0.2, 0.3] as const;

describe("resolvePointCloudColorPolicy", () => {
  const scalarSource = (fieldName: string) =>
    fieldName === "intensity"
      ? {
          fieldLabel: "Intensity",
          range: SCALAR_RANGE,
          source: "scalar-source",
        }
      : null;
  const baseOptions = {
    fixedRange: null,
    heightRange: HEIGHT_RANGE,
    rgbSource: "rgb-source",
    scalarSource,
    uniformColor: UNIFORM_COLOR,
  };

  it("uses RGB before scalar and height sources in auto mode", () => {
    expect(resolvePointCloudColorPolicy(baseOptions)).toEqual({
      kind: "rgb",
      source: "rgb-source",
    });
  });

  it("falls through scalar and height sources in auto mode", () => {
    expect(
      resolvePointCloudColorPolicy({ ...baseOptions, rgbSource: null }),
    ).toEqual({
      fieldLabel: "Intensity",
      kind: "scalar",
      maxValue: 3,
      minValue: 1,
      source: "scalar-source",
    });
    expect(
      resolvePointCloudColorPolicy({
        ...baseOptions,
        rgbSource: null,
        scalarSource: () => null,
      }),
    ).toEqual({ kind: "height", maxValue: 10, minValue: 0 });
  });

  it("honors explicit uniform, scalar, and height modes", () => {
    expect(
      resolvePointCloudColorPolicy({
        ...baseOptions,
        colorBy: "uniform",
      }),
    ).toEqual({ color: UNIFORM_COLOR, kind: "uniform" });
    expect(
      resolvePointCloudColorPolicy({
        ...baseOptions,
        colorBy: "intensity",
      }),
    ).toMatchObject({ kind: "scalar", source: "scalar-source" });
    expect(
      resolvePointCloudColorPolicy({ ...baseOptions, colorBy: "height" }),
    ).toEqual({ kind: "height", maxValue: 10, minValue: 0 });
  });

  it("uses the neutral color when an explicit source is unavailable", () => {
    expect(
      resolvePointCloudColorPolicy({
        ...baseOptions,
        colorBy: "missing",
      }),
    ).toEqual({ color: NEUTRAL_POINT_CLOUD_COLOR, kind: "uniform" });
  });
});

describe("resolvePointCloudFixedRange", () => {
  it.each([
    [{}, null],
    [{ rangeMax: 1, rangeMin: Number.NaN }, null],
    [{ rangeMax: Number.POSITIVE_INFINITY, rangeMin: 0 }, null],
    [{ rangeMax: 0, rangeMin: 1 }, null],
    [{ rangeMax: 1, rangeMin: 1 }, null],
    [{ rangeMax: 2, rangeMin: -1 }, [-1, 2]],
  ] as const)("validates %o", (input, expected) => {
    expect(resolvePointCloudFixedRange(input)).toEqual(expected);
  });
});

describe("normalizePointCloudColorValue", () => {
  it("uses the minimum useful span and clamps the result", () => {
    expect(normalizePointCloudColorValue(5.0000005, 5, 5)).toBeCloseTo(0.5);
    expect(normalizePointCloudColorValue(-1, 0, 10)).toBe(0);
    expect(normalizePointCloudColorValue(11, 0, 10)).toBe(1);
    expect(normalizePointCloudColorValue(5, 0, 10)).toBe(0.5);
  });
});
