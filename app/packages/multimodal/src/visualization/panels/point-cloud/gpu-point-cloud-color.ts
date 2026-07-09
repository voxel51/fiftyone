import type {
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
} from "../../../decoders";
import {
  createPointCloudColormapLookup,
  DEFAULT_POINT_CLOUD_COLORMAP,
  pointCloudColormapKey,
  writeColormapLookupColor,
  type PointCloudColormap,
  type PointCloudColormapLookup,
} from "./colormaps";
import type { PointCloudColorOptions } from "./point-cloud-colors";
import type { PointCloudColorRamp } from "./types";
import { clamp01, hexToRgbUnit, normalizeIdentifierName } from "./utils";

const HEIGHT_RANGE_EPSILON = 0.000001;
const HEIGHT_FIELD_LABEL = "height";
const RGB_COMPONENT_COUNT = 3;
const CANONICAL_SCALAR_COLOR_FIELDS = [
  "intensity",
  "reflectivity",
  "reflectance",
  "rcs",
] as const;
export const NEUTRAL_GPU_POINT_COLOR = [0.72, 0.76, 0.82] as const;

export type GpuPointCloudColorSource =
  | {
      readonly colors: Float32Array;
      readonly kind: "rgb";
    }
  | {
      readonly kind: "height";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly field: PointCloudRenderScalarField;
      readonly kind: "scalar";
      readonly maxValue: number;
      readonly minValue: number;
    }
  | {
      readonly color: readonly [number, number, number];
      readonly kind: "uniform";
    };

export interface ResolvedGpuPointCloudColor {
  readonly colorRamp: PointCloudColorRamp | null;
  readonly colormap: PointCloudColormap;
  readonly source: GpuPointCloudColorSource;
}

/**
 * Resolves a decoder-prepared cloud's colour mode without scanning point
 * arrays. This is the single policy entrypoint for GPU 3D/projection
 * materials and O(1) hover-colour reconstruction.
 */
export function resolveGpuPointCloudColor(
  payload: PointCloudRenderPayload,
  options: PointCloudColorOptions,
): ResolvedGpuPointCloudColor {
  const colormap = options.colormap ?? DEFAULT_POINT_CLOUD_COLORMAP;
  const fixedRange = resolveFixedRange(options);
  const requested = options.colorBy;
  let source: GpuPointCloudColorSource | null;

  if (requested && requested !== "auto") {
    source = requestedColorSource(payload, requested, options, fixedRange);
  } else {
    source = rgbColorSource(payload);
    if (!source) {
      for (const fieldName of CANONICAL_SCALAR_COLOR_FIELDS) {
        source = scalarColorSource(payload, fieldName, fixedRange);
        if (source) break;
      }
    }
    source ??= heightColorSource(payload, fixedRange);
  }

  source ??= neutralColorSource();
  return {
    colorRamp: colorRampForSource(source, colormap, payload.sampledPointCount),
    colormap,
    source,
  };
}

/** Resolves one sampled point's final RGB in constant time. */
export function gpuPointCloudColorAtSample(
  color: ResolvedGpuPointCloudColor,
  payload: PointCloudRenderPayload,
  sampleIndex: number,
): readonly [number, number, number] | null {
  if (
    !Number.isInteger(sampleIndex) ||
    sampleIndex < 0 ||
    sampleIndex >= payload.sampledPointCount
  ) {
    return null;
  }

  const { source } = color;
  if (source.kind === "uniform") {
    return source.color;
  }
  if (source.kind === "rgb") {
    const offset = sampleIndex * RGB_COMPONENT_COUNT;
    return [
      clamp01(source.colors[offset]),
      clamp01(source.colors[offset + 1]),
      clamp01(source.colors[offset + 2]),
    ];
  }

  const value =
    source.kind === "height"
      ? payload.positions[sampleIndex * RGB_COMPONENT_COUNT + 2]
      : source.field.values[sampleIndex];
  if (!Number.isFinite(value)) {
    return NEUTRAL_GPU_POINT_COLOR;
  }

  const target = new Float32Array(RGB_COMPONENT_COUNT);
  writeColormapLookupColor(
    target,
    0,
    colormapLookup(color.colormap),
    normalizeValue(value, source.minValue, source.maxValue),
  );
  return [target[0], target[1], target[2]];
}

function requestedColorSource(
  payload: PointCloudRenderPayload,
  colorBy: NonNullable<PointCloudColorOptions["colorBy"]>,
  options: PointCloudColorOptions,
  fixedRange: readonly [number, number] | null,
): GpuPointCloudColorSource | null {
  if (colorBy === "uniform") {
    return {
      color:
        hexToRgbUnit(options.uniformColor ?? "") ?? NEUTRAL_GPU_POINT_COLOR,
      kind: "uniform",
    };
  }
  if (colorBy === "height") {
    return heightColorSource(payload, fixedRange);
  }
  if (colorBy === "rgb") {
    return rgbColorSource(payload);
  }
  return scalarColorSource(payload, colorBy, fixedRange);
}

function rgbColorSource(
  payload: PointCloudRenderPayload,
): GpuPointCloudColorSource | null {
  return payload.colors &&
    payload.colors.length >= payload.capacity * RGB_COMPONENT_COUNT
    ? { colors: payload.colors, kind: "rgb" }
    : null;
}

function heightColorSource(
  payload: PointCloudRenderPayload,
  fixedRange: readonly [number, number] | null,
): GpuPointCloudColorSource | null {
  if (payload.finitePointCount === 0) {
    return null;
  }
  const range = fixedRange ?? usefulRange(payload.heightRange);
  return range
    ? { kind: "height", maxValue: range[1], minValue: range[0] }
    : null;
}

function scalarColorSource(
  payload: PointCloudRenderPayload,
  requestedName: string,
  fixedRange: readonly [number, number] | null,
): GpuPointCloudColorSource | null {
  const normalizedName = normalizeIdentifierName(requestedName);
  const field = payload.scalarFields.find(
    (candidate) => normalizeIdentifierName(candidate.name) === normalizedName,
  );
  if (!field) {
    return null;
  }
  const range = fixedRange ?? usefulRange(field.range);
  return range
    ? {
        field,
        kind: "scalar",
        maxValue: range[1],
        minValue: range[0],
      }
    : null;
}

function colorRampForSource(
  source: GpuPointCloudColorSource,
  colormap: PointCloudColormap,
  renderedPointCount: number,
): PointCloudColorRamp | null {
  if (renderedPointCount === 0) {
    return null;
  }
  if (source.kind === "height") {
    return {
      colormap,
      fieldLabel: HEIGHT_FIELD_LABEL,
      maxValue: source.maxValue,
      minValue: source.minValue,
    };
  }
  if (source.kind === "scalar") {
    return {
      colormap,
      fieldLabel: source.field.name,
      maxValue: source.maxValue,
      minValue: source.minValue,
    };
  }
  return null;
}

function neutralColorSource(): GpuPointCloudColorSource {
  return { color: NEUTRAL_GPU_POINT_COLOR, kind: "uniform" };
}

function resolveFixedRange({
  rangeMax,
  rangeMin,
}: PointCloudColorOptions): readonly [number, number] | null {
  return typeof rangeMin === "number" &&
    typeof rangeMax === "number" &&
    Number.isFinite(rangeMin) &&
    Number.isFinite(rangeMax) &&
    rangeMin < rangeMax
    ? [rangeMin, rangeMax]
    : null;
}

function usefulRange(
  range: { readonly max: number; readonly min: number } | null,
): readonly [number, number] | null {
  return range &&
    Number.isFinite(range.min) &&
    Number.isFinite(range.max) &&
    range.max - range.min > HEIGHT_RANGE_EPSILON
    ? [range.min, range.max]
    : null;
}

function normalizeValue(value: number, min: number, max: number): number {
  return clamp01((value - min) / Math.max(HEIGHT_RANGE_EPSILON, max - min));
}

const colormapLookups = new Map<string, PointCloudColormapLookup>();

function colormapLookup(
  colormap: PointCloudColormap,
): PointCloudColormapLookup {
  const key = pointCloudColormapKey(colormap);
  const cached = colormapLookups.get(key);
  if (cached) {
    return cached;
  }
  const created = createPointCloudColormapLookup(colormap);
  colormapLookups.set(key, created);
  return created;
}
