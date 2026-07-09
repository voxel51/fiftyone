import type {
  PointCloudBounds,
  PointCloudNumericRange,
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
  PointCloudScalarField,
} from "./types";

/** Maximum number of finite points retained in a decoder render payload. */
export const MAX_POINT_CLOUD_RENDER_POINTS = 150_000;

const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;
const MIN_POINT_CLOUD_RENDER_CAPACITY = 1_024;

/**
 * Builds the bounded point-cloud payload shared by renderers. Sampling is
 * deterministic and uniform over finite source points, including the first
 * and last finite point when the cloud exceeds the render budget.
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
    if (!isFinitePosition(x, y, z)) {
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
  const sampledColors = hasAlignedColors
    ? new Float32Array(capacity * COLOR_COMPONENT_COUNT)
    : undefined;
  const sampledScalarFields: PointCloudRenderScalarField[] = scalarStats.map(
    ({ finiteValueCount, max, min, name }) => ({
      finiteValueCount,
      name,
      range: finiteValueCount > 0 ? { max, min } : null,
      values: new Float32Array(capacity),
    }),
  );

  if (sampledPointCount > 0) {
    sampleFinitePoints({
      colors,
      finitePointCount,
      pointCount,
      positions,
      sampledColors,
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
    bounds,
    capacity,
    ...(sampledColors ? { colors: sampledColors } : {}),
    finitePointCount,
    heightRange,
    positions: sampledPositions,
    sampledPointCount,
    scalarFields: sampledScalarFields,
    sourceIndices,
  };
}

function sampleFinitePoints({
  colors,
  finitePointCount,
  pointCount,
  positions,
  sampledColors,
  sampledPointCount,
  sampledPositions,
  sampledScalarFields,
  scalarFields,
  sourceIndices,
}: {
  readonly colors?: Float32Array;
  readonly finitePointCount: number;
  readonly pointCount: number;
  readonly positions: Float32Array;
  readonly sampledColors?: Float32Array;
  readonly sampledPointCount: number;
  readonly sampledPositions: Float32Array;
  readonly sampledScalarFields: readonly PointCloudRenderScalarField[];
  readonly scalarFields: readonly PointCloudScalarField[];
  readonly sourceIndices: Uint32Array;
}): void {
  let finiteOrdinal = 0;
  let sampleIndex = 0;
  let targetOrdinal = sampledFiniteOrdinal(
    sampleIndex,
    sampledPointCount,
    finitePointCount,
  );

  for (
    let pointIndex = 0;
    pointIndex < pointCount && sampleIndex < sampledPointCount;
    pointIndex++
  ) {
    const sourceOffset = pointIndex * POINT_COMPONENT_COUNT;
    const x = positions[sourceOffset];
    const y = positions[sourceOffset + 1];
    const z = positions[sourceOffset + 2];
    if (!isFinitePosition(x, y, z)) {
      continue;
    }

    if (finiteOrdinal === targetOrdinal) {
      const targetOffset = sampleIndex * POINT_COMPONENT_COUNT;
      sampledPositions[targetOffset] = x;
      sampledPositions[targetOffset + 1] = y;
      sampledPositions[targetOffset + 2] = z;
      if (sampledColors && colors) {
        sampledColors[targetOffset] = colors[sourceOffset];
        sampledColors[targetOffset + 1] = colors[sourceOffset + 1];
        sampledColors[targetOffset + 2] = colors[sourceOffset + 2];
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
      targetOrdinal = sampledFiniteOrdinal(
        sampleIndex,
        sampledPointCount,
        finitePointCount,
      );
    }
    finiteOrdinal++;
  }
}

function pointCloudRenderCapacity(sampledPointCount: number): number {
  const required = Math.max(MIN_POINT_CLOUD_RENDER_CAPACITY, sampledPointCount);
  if (required > 2 ** 17) {
    return MAX_POINT_CLOUD_RENDER_POINTS;
  }
  return 2 ** Math.ceil(Math.log2(required));
}

function sampledFiniteOrdinal(
  sampleIndex: number,
  sampledPointCount: number,
  finitePointCount: number,
): number {
  if (sampledPointCount <= 1) {
    return 0;
  }
  return Math.floor(
    (sampleIndex * (finitePointCount - 1)) / (sampledPointCount - 1),
  );
}

function isFinitePosition(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}
