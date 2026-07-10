import * as THREE from "three";
import * as TSL from "three/tsl";

import {
  NEUTRAL_GPU_POINT_COLOR,
  type ResolvedGpuPointCloudColor,
} from "./gpu-point-cloud-color";
import { getGpuPointCloudColormapTexture } from "./gpu-point-cloud-colormap-texture";
import { pointCloudColormapKey } from "../colormaps";

const RANGE_EPSILON = 1e-6;
const MAX_FINITE_FLOAT32 = 3.4e38;
const COLORMAP_LUT_SIZE = 256;
const COLORMAP_LUT_LAST_INDEX = COLORMAP_LUT_SIZE - 1;

interface GpuColorNode {
  readonly rgb: GpuColorNode;
  readonly x: GpuColorNode;
  readonly y: GpuColorNode;
  readonly z: GpuColorNode;
  add(value: GpuColorNode | number): GpuColorNode;
  div(value: GpuColorNode | number): GpuColorNode;
  mul(value: GpuColorNode | number): GpuColorNode;
  sub(value: GpuColorNode | number): GpuColorNode;
}

interface GpuColorUniformNode<T> extends GpuColorNode {
  value: T;
}

const colorTsl = TSL as unknown as {
  abs(value: GpuColorNode): GpuColorNode;
  and(...conditions: readonly GpuColorNode[]): GpuColorNode;
  clamp(
    value: GpuColorNode,
    min: GpuColorNode | number,
    max: GpuColorNode | number,
  ): GpuColorNode;
  equal(left: GpuColorNode, right: GpuColorNode | number): GpuColorNode;
  lessThanEqual(left: GpuColorNode, right: GpuColorNode | number): GpuColorNode;
  select(
    condition: GpuColorNode,
    whenTrue: GpuColorNode,
    whenFalse: GpuColorNode,
  ): GpuColorNode;
  texture(texture: THREE.Texture, uv: GpuColorNode): GpuColorNode;
  uniform<T extends number | THREE.Vector3>(value: T): GpuColorUniformNode<T>;
  vec2(...values: readonly (GpuColorNode | number)[]): GpuColorNode;
  vec3(...values: readonly (GpuColorNode | number)[]): GpuColorNode;
};

/** GPU attributes or caller-provided nodes available to point-color shaders. */
export interface GpuPointCloudColorNodeAttributes {
  readonly color: THREE.InstancedBufferAttribute | null;
  /** Caller-indexed RGB node; overrides the implicit instance attribute. */
  readonly colorNode?: TSL.Node | null;
  readonly positionNode: TSL.Node;
  readonly scalar: ReadonlyMap<string, THREE.InstancedBufferAttribute>;
  /** Caller-indexed scalar nodes; override implicit instance attributes. */
  readonly scalarNodes?: ReadonlyMap<string, TSL.Node>;
}

/** Mutable uniforms shared by a GPU point-color shader graph. */
export interface GpuPointCloudColorUniforms {
  readonly color: GpuColorUniformNode<THREE.Vector3>;
  readonly minValue: GpuColorUniformNode<number>;
  readonly valueRange: GpuColorUniformNode<number>;
}

/** Material topology key; frame-varying color values deliberately stay out. */
export function gpuPointCloudColorNodeKey(
  color: ResolvedGpuPointCloudColor,
): string {
  // Only choices that change storage access or LUT sampling belong in this
  // key. Per-frame ranges and uniform values update existing uniforms.
  const source = color.source;
  if (source.kind === "uniform" || source.kind === "rgb") return source.kind;
  const field = source.kind === "height" ? "height" : source.field.name;
  return `${source.kind}:${field}:${pointCloudColormapKey(color.colormap)}`;
}

/** Creates and initializes uniforms for a resolved point-cloud color policy. */
export function createGpuPointCloudColorUniforms(
  color: ResolvedGpuPointCloudColor,
): GpuPointCloudColorUniforms {
  const uniforms = {
    color: colorTsl.uniform(new THREE.Vector3()),
    minValue: colorTsl.uniform(0),
    valueRange: colorTsl.uniform(1),
  };
  updateGpuPointCloudColorUniforms(uniforms, color);
  return uniforms;
}

/** Updates frame-varying values without rebuilding the shader graph. */
export function updateGpuPointCloudColorUniforms(
  uniforms: GpuPointCloudColorUniforms,
  color: ResolvedGpuPointCloudColor,
): void {
  const source = color.source;
  if (source.kind === "uniform") {
    uniforms.color.value.set(...source.color);
  }
  if (source.kind === "height" || source.kind === "scalar") {
    uniforms.minValue.value = source.minValue;
    uniforms.valueRange.value = Math.max(
      RANGE_EPSILON,
      source.maxValue - source.minValue,
    );
  }
}

/**
 * Resolves the shared pointcloud colour policy entirely in the vertex graph.
 * Position and scalar arrays are decoder-sampled and instance-aligned, so no
 * CPU colour expansion is needed for either 3D or image projections.
 */
export function createGpuPointCloudColorNode(
  color: ResolvedGpuPointCloudColor,
  attributes: GpuPointCloudColorNodeAttributes,
  uniforms = createGpuPointCloudColorUniforms(color),
): TSL.Node {
  const source = color.source;
  if (source.kind === "uniform") {
    return uniforms.color as unknown as TSL.Node;
  }
  if (source.kind === "rgb") {
    return (
      attributes.colorNode ??
      (attributes.color
        ? TSL.instancedBufferAttribute(attributes.color, "vec3")
        : (colorTsl.vec3(...NEUTRAL_GPU_POINT_COLOR) as unknown as TSL.Node))
    );
  }

  const value =
    source.kind === "height"
      ? ((attributes.positionNode as unknown as GpuColorNode).z as GpuColorNode)
      : ((attributes.scalarNodes?.get(source.field.name) as
          | GpuColorNode
          | undefined) ??
        scalarValueNode(attributes.scalar.get(source.field.name)));
  if (!value) {
    return colorTsl.vec3(...NEUTRAL_GPU_POINT_COLOR) as unknown as TSL.Node;
  }

  const normalized = colorTsl.clamp(
    value.sub(uniforms.minValue).div(uniforms.valueRange),
    0,
    1,
  );
  // Sample texel centers (i + 0.5) so the linear filter interpolates adjacent
  // LUT entries instead of blending against texture-edge behavior.
  const sampled = colorTsl.texture(
    getGpuPointCloudColormapTexture(color.colormap),
    colorTsl.vec2(
      normalized.mul(COLORMAP_LUT_LAST_INDEX).add(0.5).div(COLORMAP_LUT_SIZE),
      0.5,
    ),
  ).rgb;
  // WGSL has no portable Number.isFinite node in this pinned TSL surface.
  // NaN fails value == value; magnitudes beyond float32 finite range catch
  // infinities before they can produce an undefined texture coordinate.
  const finite = colorTsl.and(
    colorTsl.equal(value, value),
    colorTsl.lessThanEqual(colorTsl.abs(value), MAX_FINITE_FLOAT32),
  );
  return colorTsl.select(
    finite,
    sampled,
    colorTsl.vec3(...NEUTRAL_GPU_POINT_COLOR),
  ) as unknown as TSL.Node;
}

function scalarValueNode(
  attribute: THREE.InstancedBufferAttribute | undefined,
): GpuColorNode | null {
  return attribute
    ? (TSL.instancedBufferAttribute(
        attribute,
        "float",
      ) as unknown as GpuColorNode)
    : null;
}
