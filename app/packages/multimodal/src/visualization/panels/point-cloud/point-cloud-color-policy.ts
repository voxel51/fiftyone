import type { PointCloudColorBy } from "./types";
import { clamp01 } from "./utils";

const POINT_CLOUD_COLOR_RANGE_EPSILON = 0.000001;

/** Canonical scalar channels considered by automatic point-cloud coloring. */
export const CANONICAL_POINT_CLOUD_SCALAR_COLOR_FIELDS = [
  "intensity",
  "reflectivity",
  "reflectance",
  "rcs",
] as const;

/** Default normalized RGB used when a point cloud has no usable color source. */
export const NEUTRAL_POINT_CLOUD_COLOR = [0.72, 0.76, 0.82] as const;

/** Inclusive normalization range for a point-cloud scalar ramp. */
export type PointCloudColorRange = readonly [number, number];

/** Representation-neutral scalar source offered to the color policy. */
export interface PointCloudScalarColorCandidate<Source> {
  readonly fieldLabel: string;
  readonly range: PointCloudColorRange | null;
  readonly source: Source;
}

/** Point-cloud color selection shared by CPU and GPU render paths. */
export type ResolvedPointCloudColorPolicy<RgbSource, ScalarSource> =
  | { readonly kind: "rgb"; readonly source: RgbSource }
  | {
      readonly kind: "height";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly fieldLabel: string;
      readonly kind: "scalar";
      readonly maxValue: number;
      readonly minValue: number;
      readonly source: ScalarSource;
    }
  | {
      readonly color: readonly [number, number, number];
      readonly kind: "uniform";
    };

/** Resolves color mode and normalization range without coupling data layouts. */
export function resolvePointCloudColorPolicy<RgbSource, ScalarSource>({
  colorBy,
  fixedRange,
  heightRange,
  rgbSource,
  scalarSource,
  uniformColor,
}: {
  readonly colorBy?: PointCloudColorBy;
  readonly fixedRange: PointCloudColorRange | null;
  readonly heightRange: PointCloudColorRange | null;
  readonly rgbSource: RgbSource | null;
  readonly scalarSource: (
    fieldName: string,
  ) => PointCloudScalarColorCandidate<ScalarSource> | null;
  readonly uniformColor: readonly [number, number, number];
}): ResolvedPointCloudColorPolicy<RgbSource, ScalarSource> {
  if (colorBy && colorBy !== "auto") {
    return (
      requestedColorPolicy({
        colorBy,
        fixedRange,
        heightRange,
        rgbSource,
        scalarSource,
        uniformColor,
      }) ?? neutralColorPolicy()
    );
  }

  if (rgbSource !== null) {
    return { kind: "rgb", source: rgbSource };
  }

  for (const fieldName of CANONICAL_POINT_CLOUD_SCALAR_COLOR_FIELDS) {
    const resolved = resolveScalarPolicy(scalarSource(fieldName), fixedRange);
    if (resolved) return resolved;
  }

  return resolveHeightPolicy(heightRange, fixedRange) ?? neutralColorPolicy();
}

/** Validates an optional fixed point-cloud normalization range. */
export function resolvePointCloudFixedRange({
  rangeMax,
  rangeMin,
}: {
  readonly rangeMax?: number;
  readonly rangeMin?: number;
}): PointCloudColorRange | null {
  return typeof rangeMin === "number" &&
    typeof rangeMax === "number" &&
    Number.isFinite(rangeMin) &&
    Number.isFinite(rangeMax) &&
    rangeMin < rangeMax
    ? [rangeMin, rangeMax]
    : null;
}

/** Normalizes a scalar using the shared minimum useful span. */
export function normalizePointCloudColorValue(
  value: number,
  min: number,
  max: number,
): number {
  return clamp01(
    (value - min) / Math.max(POINT_CLOUD_COLOR_RANGE_EPSILON, max - min),
  );
}

function requestedColorPolicy<RgbSource, ScalarSource>({
  colorBy,
  fixedRange,
  heightRange,
  rgbSource,
  scalarSource,
  uniformColor,
}: {
  readonly colorBy: Exclude<PointCloudColorBy, "auto">;
  readonly fixedRange: PointCloudColorRange | null;
  readonly heightRange: PointCloudColorRange | null;
  readonly rgbSource: RgbSource | null;
  readonly scalarSource: (
    fieldName: string,
  ) => PointCloudScalarColorCandidate<ScalarSource> | null;
  readonly uniformColor: readonly [number, number, number];
}): ResolvedPointCloudColorPolicy<RgbSource, ScalarSource> | null {
  if (colorBy === "uniform") {
    return { color: uniformColor, kind: "uniform" };
  }
  if (colorBy === "height") {
    return resolveHeightPolicy(heightRange, fixedRange);
  }
  if (colorBy === "rgb") {
    return rgbSource === null ? null : { kind: "rgb", source: rgbSource };
  }
  return resolveScalarPolicy(scalarSource(colorBy), fixedRange);
}

function resolveScalarPolicy<ScalarSource>(
  candidate: PointCloudScalarColorCandidate<ScalarSource> | null,
  fixedRange: PointCloudColorRange | null,
): ResolvedPointCloudColorPolicy<never, ScalarSource> | null {
  if (!candidate) return null;
  const range = fixedRange ?? usefulPointCloudColorRange(candidate.range);
  return range
    ? {
        fieldLabel: candidate.fieldLabel,
        kind: "scalar",
        maxValue: range[1],
        minValue: range[0],
        source: candidate.source,
      }
    : null;
}

function resolveHeightPolicy(
  heightRange: PointCloudColorRange | null,
  fixedRange: PointCloudColorRange | null,
): ResolvedPointCloudColorPolicy<never, never> | null {
  if (!heightRange) return null;
  const range = fixedRange ?? usefulPointCloudColorRange(heightRange);
  return range
    ? { kind: "height", maxValue: range[1], minValue: range[0] }
    : null;
}

function usefulPointCloudColorRange(
  range: PointCloudColorRange | null,
): PointCloudColorRange | null {
  return range &&
    Number.isFinite(range[0]) &&
    Number.isFinite(range[1]) &&
    range[1] - range[0] > POINT_CLOUD_COLOR_RANGE_EPSILON
    ? range
    : null;
}

function neutralColorPolicy(): ResolvedPointCloudColorPolicy<never, never> {
  return { color: NEUTRAL_POINT_CLOUD_COLOR, kind: "uniform" };
}
