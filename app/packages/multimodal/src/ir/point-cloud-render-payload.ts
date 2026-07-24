import type {
  PointCloudBounds,
  PointCloudNumericRange,
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
  PointCloudScalarField,
} from "./frames";
import {
  POINT_CLOUD_FLOAT32_SCALAR_ENCODING,
  POINT_CLOUD_RGB_ENCODING,
} from "./point-cloud-channel-encoding";

/** Maximum number of finite points retained in a decoder render payload. */
export const MAX_POINT_CLOUD_RENDER_POINTS = 150_000;

const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;
const MIN_POINT_CLOUD_RENDER_CAPACITY = 1_024;
const LARGE_POINT_CLOUD_CAPACITY_GRANULARITY = 4_096;
const POWER_OF_TWO_CAPACITY_LIMIT = 8_192;

/**
 * Builds the bounded point-cloud payload shared by renderers. Samples follow a
 * deterministic bit-reversed source order, so every lower render budget can
 * draw a stable prefix while remaining distributed across the source domain.
 */
export function buildPointCloudRenderPayload({
  colors,
  positions,
  scalarFields = [],
}: {
  readonly colors?: Float32Array;
  readonly positions: Float32Array;
  readonly scalarFields?: readonly PointCloudScalarField[];
}): PointCloudRenderPayload {
  const pointCount = Math.floor(positions.length / POINT_COMPONENT_COUNT);
  const scalarStats = scalarFields.map((field) => ({
    finiteValueCount: 0,
    max: -Infinity,
    min: Infinity,
    name: field.name,
    values: field.values,
  }));
  let finitePointCount = 0;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (!isFinitePointCloudPosition(x, y, z)) {
      continue;
    }

    finitePointCount++;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);

    for (const stats of scalarStats) {
      const value = stats.values[pointIndex];
      if (!Number.isFinite(value)) {
        continue;
      }
      stats.finiteValueCount++;
      stats.min = Math.min(stats.min, value);
      stats.max = Math.max(stats.max, value);
    }
  }

  const sampledPointCount = Math.min(
    finitePointCount,
    MAX_POINT_CLOUD_RENDER_POINTS,
  );
  const capacity = pointCloudRenderCapacity(sampledPointCount);
  const sourceIndices = new Uint32Array(capacity);
  const sampledPositions = new Float32Array(capacity * POINT_COMPONENT_COUNT);
  const hasAlignedColors =
    colors !== undefined && colors.length >= pointCount * COLOR_COMPONENT_COUNT;
  const sampledRgbValues = hasAlignedColors
    ? new Uint8Array(capacity * COLOR_COMPONENT_COUNT)
    : undefined;
  const sampledScalarFields: PointCloudRenderScalarField[] = scalarStats.map(
    ({ finiteValueCount, max, min, name }) => ({
      encoding: POINT_CLOUD_FLOAT32_SCALAR_ENCODING,
      finiteValueCount,
      name,
      range: finiteValueCount > 0 ? { max, min } : null,
      values: new Float32Array(capacity),
    }),
  );

  if (sampledPointCount > 0) {
    sampleFinitePoints({
      colors,
      pointCount,
      positions,
      sampledRgbValues,
      sampledPointCount,
      sampledPositions,
      sampledScalarFields,
      scalarFields,
      sourceIndices,
    });
  }

  const bounds: PointCloudBounds | null =
    finitePointCount > 0
      ? { max: [maxX, maxY, maxZ], min: [minX, minY, minZ] }
      : null;
  const heightRange: PointCloudNumericRange | null =
    finitePointCount > 0 ? { max: maxZ, min: minZ } : null;

  return {
    availableScalarFields: scalarFields.map((field) => field.name),
    bounds,
    capacity,
    finitePointCount,
    hasRgb: hasAlignedColors,
    heightRange,
    positions: sampledPositions,
    ...(sampledRgbValues
      ? {
          rgb: {
            encoding: POINT_CLOUD_RGB_ENCODING,
            values: sampledRgbValues,
          },
        }
      : {}),
    sampledPointCount,
    samplePlanKey: pointCloudSamplePlanKey(pointCount, sampledPointCount),
    scalarFields: sampledScalarFields,
    sourcePointCount: pointCount,
    sourceIndices,
  };
}

/** Stable key for the current nested source-index plan/version. */
export function pointCloudSamplePlanKey(
  sourcePointCount: number,
  sampledPointCount: number,
): string {
  return `nested-v1:${Math.max(0, Math.floor(sourcePointCount))}:${Math.max(
    0,
    Math.floor(sampledPointCount),
  )}`;
}

function sampleFinitePoints({
  colors,
  pointCount,
  positions,
  sampledRgbValues,
  sampledPointCount,
  sampledPositions,
  sampledScalarFields,
  scalarFields,
  sourceIndices,
}: {
  readonly colors?: Float32Array;
  readonly pointCount: number;
  readonly positions: Float32Array;
  readonly sampledRgbValues?: Uint8Array;
  readonly sampledPointCount: number;
  readonly sampledPositions: Float32Array;
  readonly sampledScalarFields: readonly PointCloudRenderScalarField[];
  readonly scalarFields: readonly PointCloudScalarField[];
  readonly sourceIndices: Uint32Array;
}): void {
  let sampleIndex = 0;
  const sampleDomainSize = pointCloudSampleDomainSize(pointCount);

  for (
    let sequenceIndex = 0;
    sequenceIndex < sampleDomainSize && sampleIndex < sampledPointCount;
    sequenceIndex++
  ) {
    const pointIndex = progressivePointCloudSourceIndex(
      sequenceIndex,
      sampleDomainSize,
    );
    if (pointIndex >= pointCount) {
      continue;
    }
    const sourceOffset = pointIndex * POINT_COMPONENT_COUNT;
    const x = positions[sourceOffset];
    const y = positions[sourceOffset + 1];
    const z = positions[sourceOffset + 2];
    if (!isFinitePointCloudPosition(x, y, z)) {
      continue;
    }

    const targetOffset = sampleIndex * POINT_COMPONENT_COUNT;
    sampledPositions[targetOffset] = x;
    sampledPositions[targetOffset + 1] = y;
    sampledPositions[targetOffset + 2] = z;
    if (sampledRgbValues && colors) {
      sampledRgbValues[targetOffset] = normalizedColorByte(
        colors[sourceOffset],
      );
      sampledRgbValues[targetOffset + 1] = normalizedColorByte(
        colors[sourceOffset + 1],
      );
      sampledRgbValues[targetOffset + 2] = normalizedColorByte(
        colors[sourceOffset + 2],
      );
    }
    for (let fieldIndex = 0; fieldIndex < scalarFields.length; fieldIndex++) {
      const sourceValues = scalarFields[fieldIndex].values;
      sampledScalarFields[fieldIndex].values[sampleIndex] =
        pointIndex < sourceValues.length
          ? sourceValues[pointIndex]
          : Number.NaN;
    }
    sourceIndices[sampleIndex] = pointIndex;
    sampleIndex++;
  }
}

function normalizedColorByte(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

export function pointCloudRenderCapacity(sampledPointCount: number): number {
  const required = Math.max(MIN_POINT_CLOUD_RENDER_CAPACITY, sampledPointCount);
  if (required >= MAX_POINT_CLOUD_RENDER_POINTS) {
    return MAX_POINT_CLOUD_RENDER_POINTS;
  }
  if (required <= POWER_OF_TWO_CAPACITY_LIMIT) {
    return 2 ** Math.ceil(Math.log2(required));
  }
  return (
    Math.ceil(required / LARGE_POINT_CLOUD_CAPACITY_GRANULARITY) *
    LARGE_POINT_CLOUD_CAPACITY_GRANULARITY
  );
}

export function pointCloudSampleDomainSize(pointCount: number): number {
  const normalizedPointCount = Number.isFinite(pointCount)
    ? Math.max(0, Math.floor(pointCount))
    : 0;
  if (normalizedPointCount === 0) {
    return 0;
  }
  return 2 ** Math.ceil(Math.log2(normalizedPointCount));
}

/**
 * Returns one index in a power-of-two domain's bit-reversed order.
 *
 * For an organized row-major cloud this progressively spreads early samples
 * across both scan rows and columns. Consumers can therefore draw any prefix
 * without changing the identity of points retained by smaller budgets.
 */
export function progressivePointCloudSourceIndex(
  sequenceIndex: number,
  sampleDomainSize: number,
): number {
  let reversed = sequenceIndex >>> 0;
  reversed = ((reversed >>> 1) & 0x55555555) | ((reversed & 0x55555555) << 1);
  reversed = ((reversed >>> 2) & 0x33333333) | ((reversed & 0x33333333) << 2);
  reversed = ((reversed >>> 4) & 0x0f0f0f0f) | ((reversed & 0x0f0f0f0f) << 4);
  reversed = ((reversed >>> 8) & 0x00ff00ff) | ((reversed & 0x00ff00ff) << 8);
  reversed = (reversed >>> 16) | (reversed << 16);
  return reversed >>> Math.clz32(sampleDomainSize - 1);
}

export function isFinitePointCloudPosition(
  x: number,
  y: number,
  z: number,
): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}
