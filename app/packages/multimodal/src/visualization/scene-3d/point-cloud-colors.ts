import * as THREE from "three";

import type { PointCloudScalarField } from "../../ir";
import {
  createPointCloudColormapLookup,
  writeColormapLookupColor,
} from "./colormaps";
import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  type PointCloudColormap,
  type PointCloudColormapLookup,
} from "./colormap-types";
import {
  NEUTRAL_POINT_CLOUD_COLOR as NEUTRAL_POINT_COLOR,
  normalizePointCloudColorValue,
  resolvePointCloudColorPolicy,
  resolvePointCloudFixedRange,
  type PointCloudColorRange,
  type PointCloudScalarColorCandidate,
} from "./point-cloud-color-policy";
import type {
  PointCloudColorBy,
  PointCloudColorRamp,
  PointCloudRenderData,
} from "./types";
import {
  clamp01,
  hexToRgbUnit,
  normalizeHexColor,
  normalizeIdentifierName,
} from "./utils";

// Render budget: beyond ~120k points the GPU cost outweighs the visual gain
// for typical LiDAR frames. Points are uniformly sampled down to this limit.
export const DEFAULT_MAX_RENDERED_POINTS = 120_000;
// Side length of the synthetic unit cube used when a cloud has no spread
// (e.g. a single point), so the camera has a non-zero target to frame.
export const EMPTY_POINT_CLOUD_BOUNDS_SIZE = 1;
const MIN_POINT_SAMPLE_COUNT = 1;
export const POINT_COMPONENT_COUNT = 3;
export const COLOR_COMPONENT_COUNT = 3;
const X_COMPONENT_INDEX = 0;
const Y_COMPONENT_INDEX = 1;
const Z_COMPONENT_INDEX = 2;
const HEIGHT_FIELD_LABEL = "height";
export interface PointCloudColorOptions {
  readonly colorBy?: PointCloudColorBy;
  readonly colormap?: PointCloudColormap;
  readonly colors?: Float32Array;
  /**
   * Fixed normalization range for scalar/height ramps. Used only when
   * both ends are finite and min < max; out-of-range values clamp.
   */
  readonly rangeMax?: number;
  readonly rangeMin?: number;
  readonly scalarFields?: readonly PointCloudScalarField[];
  /** Hex color (#rrggbb) used only when explicitly coloring uniformly. */
  readonly uniformColor?: string;
}

/**
 * Streams the resolved per-point colouring of one cloud: `write` emits
 * the colour of any source (decoded) index into a target array. Shared
 * by the 3D render path and the 2D projection overlay so a cloud's dots
 * look identical wherever it appears — same settings resolution, same
 * auto-channel fallbacks, same per-frame normalization.
 */
export interface PointCloudColorWriter {
  /** The scalar ramp in effect, for legends/emphasis; null for rgb/uniform. */
  readonly colorRamp: PointCloudColorRamp | null;
  readonly write: (
    target: Float32Array,
    targetOffset: number,
    sourcePointIndex: number,
    /** The point's sensor-frame z, driving height ramps. */
    z: number,
  ) => void;
}

/**
 * Builds the colour writer for one cloud from its decoded arrays and
 * colour settings.
 */
export function createPointCloudColorWriter(
  sourcePositions: Float32Array,
  colorOptions: PointCloudColorOptions,
): PointCloudColorWriter {
  return createPointCloudColorWriterWithBounds(
    sourcePositions,
    colorOptions,
    computeSourceHeightBounds(sourcePositions),
  );
}

function createPointCloudColorWriterWithBounds(
  sourcePositions: Float32Array,
  colorOptions: PointCloudColorOptions,
  heightBounds: ReturnType<typeof computeSourceHeightBounds>,
): PointCloudColorWriter {
  const colormapLookup = createPointCloudColormapLookup(
    colorOptions.colormap ?? DEFAULT_POINT_CLOUD_COLORMAP,
  );
  const colorSource = resolvePointCloudColorSource({
    ...colorOptions,
    heightBounds,
    sourcePointCount: Math.floor(
      sourcePositions.length / POINT_COMPONENT_COUNT,
    ),
    sourcePositions,
  });

  return {
    colorRamp: colorRampForSource(colorSource, colormapLookup.colormap, 1),
    write: (target, targetOffset, sourcePointIndex, z) =>
      writePointColor(
        target,
        targetOffset,
        colorSource,
        colormapLookup,
        sourcePointIndex,
        z,
      ),
  };
}

export function buildPointCloudRenderData(
  sourcePositions: Float32Array,
  maxRenderedPoints: number,
  colorOptions: PointCloudColorOptions,
): PointCloudRenderData {
  const sourcePointCount = Math.floor(
    sourcePositions.length / POINT_COMPONENT_COUNT,
  );
  const sampleEvery = pointSampleStride(sourcePointCount, maxRenderedPoints);
  const maxSampleCount = Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(sourcePointCount / sampleEvery),
  );
  const positions = new Float32Array(maxSampleCount * POINT_COMPONENT_COUNT);
  const colors = new Float32Array(maxSampleCount * COLOR_COMPONENT_COUNT);
  const heightBounds = computeSourceHeightBounds(sourcePositions);
  const colorWriter = createPointCloudColorWriterWithBounds(
    sourcePositions,
    colorOptions,
    heightBounds,
  );
  const bounds = new THREE.Box3();
  // Bounds are updated per rendered point; reuse one vector to avoid a large
  // allocation burst on dense point clouds.
  const tmpVec = new THREE.Vector3();
  let renderedPointCount = 0;

  bounds.makeEmpty();

  for (
    let sourcePointIndex = 0;
    sourcePointIndex < sourcePointCount;
    sourcePointIndex += sampleEvery
  ) {
    const sourceOffset = sourcePointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[sourceOffset];
    const y = sourcePositions[sourceOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[sourceOffset + Z_COMPONENT_INDEX];

    if (!isFinitePosition(x, y, z)) {
      continue;
    }

    const targetOffset = renderedPointCount * POINT_COMPONENT_COUNT;
    positions[targetOffset + X_COMPONENT_INDEX] = x;
    positions[targetOffset + Y_COMPONENT_INDEX] = y;
    positions[targetOffset + Z_COMPONENT_INDEX] = z;
    colorWriter.write(colors, targetOffset, sourcePointIndex, z);
    tmpVec.set(
      positions[targetOffset + X_COMPONENT_INDEX],
      positions[targetOffset + Y_COMPONENT_INDEX],
      positions[targetOffset + Z_COMPONENT_INDEX],
    );
    bounds.expandByPoint(tmpVec);
    renderedPointCount++;
  }

  // Sampling can miss all finite source points, so the drawn count is the
  // authoritative signal for whether Three.js needs fallback bounds.
  if (renderedPointCount === 0) {
    bounds.setFromCenterAndSize(
      new THREE.Vector3(),
      new THREE.Vector3(
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
        EMPTY_POINT_CLOUD_BOUNDS_SIZE,
      ),
    );
  }

  return {
    bounds,
    colorRamp: renderedPointCount > 0 ? colorWriter.colorRamp : null,
    colors,
    finitePointCount: heightBounds.finitePointCount,
    positions,
    renderedPointCount,
  };
}

/**
 * Recovers the source (decoded-array) index of the n-th rendered point.
 * Replays the exact sampling walk of {@link buildPointCloudRenderData}
 * (uniform stride + non-finite drop), so a raycast hit on the rendered
 * geometry maps back to decoded per-point fields without materializing an
 * index map on every playback tick — the walk runs only when picking.
 */
export function sourcePointIndexForRenderedIndex(
  sourcePositions: Float32Array,
  maxRenderedPoints: number,
  renderedIndex: number,
): number | null {
  if (!Number.isInteger(renderedIndex) || renderedIndex < 0) {
    return null;
  }

  const sourcePointCount = Math.floor(
    sourcePositions.length / POINT_COMPONENT_COUNT,
  );
  const sampleEvery = pointSampleStride(sourcePointCount, maxRenderedPoints);
  let renderedPointCount = 0;

  for (
    let sourcePointIndex = 0;
    sourcePointIndex < sourcePointCount;
    sourcePointIndex += sampleEvery
  ) {
    const sourceOffset = sourcePointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[sourceOffset];
    const y = sourcePositions[sourceOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[sourceOffset + Z_COMPONENT_INDEX];

    if (!isFinitePosition(x, y, z)) {
      continue;
    }

    if (renderedPointCount === renderedIndex) {
      return sourcePointIndex;
    }
    renderedPointCount++;
  }

  return null;
}

function pointSampleStride(
  pointCount: number,
  maxRenderedPoints: number,
): number {
  return Math.max(
    MIN_POINT_SAMPLE_COUNT,
    Math.ceil(pointCount / Math.max(MIN_POINT_SAMPLE_COUNT, maxRenderedPoints)),
  );
}

function isFinitePosition(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

type PointCloudColorSource =
  | {
      readonly kind: "height";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly colors: Float32Array;
      readonly kind: "rgb";
    }
  | {
      readonly fieldLabel: string;
      readonly kind: "scalar";
      readonly maxValue: number;
      readonly minValue: number;
      readonly values: Float32Array;
    }
  | {
      readonly color: readonly [number, number, number];
      readonly kind: "uniform";
    };

function colorRampForSource(
  colorSource: PointCloudColorSource,
  colormap: PointCloudColormap,
  renderedPointCount: number,
): PointCloudColorRamp | null {
  if (renderedPointCount === 0) {
    return null;
  }

  if (colorSource.kind === "height") {
    return {
      colormap,
      fieldLabel: HEIGHT_FIELD_LABEL,
      maxValue: colorSource.maxValue,
      minValue: colorSource.minValue,
    };
  }

  if (colorSource.kind === "scalar") {
    return {
      colormap,
      fieldLabel: colorSource.fieldLabel,
      maxValue: colorSource.maxValue,
      minValue: colorSource.minValue,
    };
  }

  return null;
}

function resolvePointCloudColorSource({
  colorBy,
  colors,
  heightBounds,
  rangeMax,
  rangeMin,
  scalarFields,
  sourcePointCount,
  sourcePositions,
  uniformColor,
}: {
  readonly colorBy?: PointCloudColorBy;
  readonly colors?: Float32Array;
  readonly heightBounds: ReturnType<typeof computeSourceHeightBounds>;
  readonly rangeMax?: number;
  readonly rangeMin?: number;
  readonly scalarFields?: readonly PointCloudScalarField[];
  readonly sourcePointCount: number;
  readonly sourcePositions: Float32Array;
  readonly uniformColor?: string;
}): PointCloudColorSource {
  const scalarSource = (
    fieldName: string,
  ): PointCloudScalarColorCandidate<Float32Array> | null => {
    const requestedName = normalizeIdentifierName(fieldName);
    const scalarField = scalarFields?.find(
      (field) => normalizeIdentifierName(field.name) === requestedName,
    );
    if (!scalarField || scalarField.values.length < sourcePointCount) {
      return null;
    }

    const bounds = computeScalarBounds(sourcePositions, scalarField.values);
    const range: PointCloudColorRange | null =
      bounds.finitePointCount > 0 ? [bounds.minValue, bounds.maxValue] : null;
    return {
      fieldLabel: scalarField.name,
      range,
      source: scalarField.values,
    };
  };
  const heightRange: PointCloudColorRange | null =
    heightBounds.finitePointCount > 0
      ? [heightBounds.minHeight, heightBounds.maxHeight]
      : null;
  const policy = resolvePointCloudColorPolicy({
    colorBy,
    fixedRange: resolvePointCloudFixedRange({ rangeMax, rangeMin }),
    heightRange,
    rgbSource:
      colors && colors.length >= sourcePointCount * COLOR_COMPONENT_COUNT
        ? colors
        : null,
    scalarSource,
    uniformColor: hexToRgbColor(uniformColor) ?? NEUTRAL_POINT_COLOR,
  });

  switch (policy.kind) {
    case "rgb":
      return { colors: policy.source, kind: "rgb" };
    case "height":
      return policy;
    case "scalar":
      return {
        fieldLabel: policy.fieldLabel,
        kind: "scalar",
        maxValue: policy.maxValue,
        minValue: policy.minValue,
        values: policy.source,
      };
    case "uniform":
      return policy;
  }
}

function writePointColor(
  target: Float32Array,
  targetOffset: number,
  colorSource: PointCloudColorSource,
  colormapLookup: PointCloudColormapLookup,
  sourcePointIndex: number,
  z: number,
) {
  if (colorSource.kind === "rgb") {
    const sourceOffset = sourcePointIndex * COLOR_COMPONENT_COUNT;
    target[targetOffset] = clamp01(colorSource.colors[sourceOffset]);
    target[targetOffset + 1] = clamp01(colorSource.colors[sourceOffset + 1]);
    target[targetOffset + 2] = clamp01(colorSource.colors[sourceOffset + 2]);
    return;
  }

  if (colorSource.kind === "height") {
    writeColormapLookupColor(
      target,
      targetOffset,
      colormapLookup,
      normalizePointCloudColorValue(
        z,
        colorSource.minValue,
        colorSource.maxValue,
      ),
    );
    return;
  }

  if (colorSource.kind === "scalar") {
    const value = colorSource.values[sourcePointIndex];
    if (Number.isFinite(value)) {
      writeColormapLookupColor(
        target,
        targetOffset,
        colormapLookup,
        normalizePointCloudColorValue(
          value,
          colorSource.minValue,
          colorSource.maxValue,
        ),
      );
      return;
    }
    writeUniformColor(target, targetOffset, NEUTRAL_POINT_COLOR);
    return;
  }

  writeUniformColor(target, targetOffset, colorSource.color);
}

function computeScalarBounds(
  sourcePositions: Float32Array,
  values: Float32Array,
) {
  let finitePointCount = 0;
  let minValue = Infinity;
  let maxValue = -Infinity;
  const pointCount = Math.min(
    values.length,
    Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT),
  );

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const positionOffset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[positionOffset];
    const y = sourcePositions[positionOffset + Y_COMPONENT_INDEX];
    const z = sourcePositions[positionOffset + Z_COMPONENT_INDEX];
    const value = values[pointIndex];

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    finitePointCount++;
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  return {
    finitePointCount,
    maxValue: finitePointCount > 0 ? maxValue : 0,
    minValue: finitePointCount > 0 ? minValue : 0,
  };
}

function computeSourceHeightBounds(sourcePositions: Float32Array) {
  let finitePointCount = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  const pointCount = Math.floor(sourcePositions.length / POINT_COMPONENT_COUNT);

  for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
    const offset = pointIndex * POINT_COMPONENT_COUNT;
    const x = sourcePositions[offset];
    const y = sourcePositions[offset + Y_COMPONENT_INDEX];
    const z = sourcePositions[offset + Z_COMPONENT_INDEX];

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    finitePointCount++;
    minHeight = Math.min(minHeight, z);
    maxHeight = Math.max(maxHeight, z);
  }

  return {
    finitePointCount,
    maxHeight: finitePointCount > 0 ? maxHeight : 0,
    minHeight: finitePointCount > 0 ? minHeight : 0,
  };
}

function writeUniformColor(
  target: Float32Array,
  offset: number,
  color: readonly [number, number, number],
) {
  target[offset] = color[0];
  target[offset + 1] = color[1];
  target[offset + 2] = color[2];
}

function hexToRgbColor(
  value: string | undefined,
): readonly [number, number, number] | null {
  const normalized = normalizeHexColor(value);
  return normalized ? hexToRgbUnit(normalized) : null;
}
