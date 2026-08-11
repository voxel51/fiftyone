import type {
  PointCloudRenderRgbChannel,
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
} from "../../../ir";
import { decodePointCloudChannelValue } from "../../../runtime/point-cloud-channel-encoding";
import {
  createPointCloudColormapLookup,
  pointCloudColormapKey,
  writeColormapLookupColor,
} from "../colormaps";
import {
  DEFAULT_POINT_CLOUD_COLORMAP,
  type PointCloudColormap,
  type PointCloudColormapLookup,
} from "../colormap-types";
import {
  NEUTRAL_POINT_CLOUD_COLOR,
  normalizePointCloudColorValue,
  resolvePointCloudColorPolicy,
  resolvePointCloudFixedRange,
  type PointCloudColorRange,
  type PointCloudScalarColorCandidate,
} from "../point-cloud-color-policy";
import type { PointCloudColorOptions } from "../point-cloud-colors";
import type { PointCloudColorRamp } from "../types";
import { clamp01, hexToRgbUnit, normalizeIdentifierName } from "../utils";

const HEIGHT_FIELD_LABEL = "height";
const RGB_COMPONENT_COUNT = 3;
/** Default normalized RGB used when a point cloud has no color channel. */
export const NEUTRAL_GPU_POINT_COLOR = NEUTRAL_POINT_CLOUD_COLOR;

/** Decoder-backed color source selected for GPU point rendering. */
export type GpuPointCloudColorSource =
  | {
      readonly kind: "rgb";
      readonly rgb: PointCloudRenderRgbChannel;
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

/** Fully resolved point-cloud color policy consumed by GPU renderers. */
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
  const scalarSource = (
    fieldName: string,
  ): PointCloudScalarColorCandidate<PointCloudRenderScalarField> | null => {
    const normalizedName = normalizeIdentifierName(fieldName);
    const field = payload.scalarFields.find(
      (candidate) => normalizeIdentifierName(candidate.name) === normalizedName,
    );
    if (!field) return null;
    const range: PointCloudColorRange | null = field.range
      ? [field.range.min, field.range.max]
      : null;
    return { fieldLabel: field.name, range, source: field };
  };
  const heightRange: PointCloudColorRange | null = payload.heightRange
    ? [payload.heightRange.min, payload.heightRange.max]
    : null;
  const policy = resolvePointCloudColorPolicy({
    colorBy: options.colorBy,
    fixedRange: resolvePointCloudFixedRange(options),
    heightRange,
    rgbSource:
      payload.rgb &&
      payload.rgb.values.length >= payload.capacity * RGB_COMPONENT_COUNT
        ? payload.rgb
        : null,
    scalarSource,
    uniformColor:
      hexToRgbUnit(options.uniformColor ?? "") ?? NEUTRAL_GPU_POINT_COLOR,
  });
  const source: GpuPointCloudColorSource =
    policy.kind === "rgb"
      ? { kind: "rgb", rgb: policy.source }
      : policy.kind === "scalar"
        ? {
            field: policy.source,
            kind: "scalar",
            maxValue: policy.maxValue,
            minValue: policy.minValue,
          }
        : policy;
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
  // Hover readback names exactly one canonical sample. Re-evaluate the same
  // color policy on that one value instead of reading rendered pixels or
  // expanding the full cloud's colors on the CPU.
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
      clamp01(
        decodePointCloudChannelValue(
          source.rgb.encoding,
          source.rgb.values[offset],
        ),
      ),
      clamp01(
        decodePointCloudChannelValue(
          source.rgb.encoding,
          source.rgb.values[offset + 1],
        ),
      ),
      clamp01(
        decodePointCloudChannelValue(
          source.rgb.encoding,
          source.rgb.values[offset + 2],
        ),
      ),
    ];
  }

  const value =
    source.kind === "height"
      ? payload.positions[sampleIndex * RGB_COMPONENT_COUNT + 2]
      : decodePointCloudChannelValue(
          source.field.encoding,
          source.field.values[sampleIndex],
        );
  if (!Number.isFinite(value)) {
    return NEUTRAL_GPU_POINT_COLOR;
  }

  const target = new Float32Array(RGB_COMPONENT_COUNT);
  writeColormapLookupColor(
    target,
    0,
    colormapLookup(color.colormap),
    normalizePointCloudColorValue(value, source.minValue, source.maxValue),
  );
  return [target[0], target[1], target[2]];
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

const colormapLookups = new Map<string, PointCloudColormapLookup>();

// CPU hover reconstruction uses the same normalized LUT data as the GPU
// texture. Cache by semantic colormap key so custom ramps retain parity too.

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
