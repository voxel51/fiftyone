/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { TypedArray } from "@fiftyone/looker/src/numpy";
import * as PIXI from "pixi.js";

import {
  alignUp,
  bufferSource,
  createUnitQuad,
  MASK_VERTEX,
  PaletteShader,
} from "./IndexedMaskMesh";
import type { ScalarImage } from "./Renderer2D";

/**
 * The value → color mapping, per fragment. Mirrors `heatmapShading` and,
 * through it, looker's heatmap painter:
 *
 * - 0 is background, and so is a value with no position on any scale. NaN
 *   fails every comparison, so `abs(v) <= MAX` is false for NaN and ±Inf
 *   alike without relying on `isnan`, which drivers may fold away.
 * - field mode: `ramp[0]`, opacity `min(max, |v|) / max` rounded to a byte
 *   as `get32BitColor` rounds it; a degenerate range (`max == 0`) is fully
 *   opaque.
 * - value mode: below the range start is background; otherwise the ramp
 *   entry `clampedIndex` picks — `floor(x + 0.5)` is `Math.round` for the
 *   non-negative positions it is applied to.
 *
 * Integer maps arrive as their little-endian bytes in up to four unorm
 * channels: each channel is rounded back to its byte before the bytes are
 * weighed together, so the reconstruction is exact rather than accumulating
 * unorm error into the high bytes. Floats arrive as R32F and are read as-is.
 */
const FRAGMENT = /* glsl */ `
  in vec2 vUV;
  in vec4 vColor;

  out vec4 finalColor;

  uniform highp sampler2D uValues;
  uniform sampler2D uRamp;

  uniform vec2 uRange;
  uniform float uMax;
  uniform float uMode;
  uniform float uRampLength;
  uniform vec4 uPlaces;
  uniform float uBytes;
  uniform float uSignedAt;

  const float MAX_FINITE = 3.4028234e38;

  void main() {
    vec4 sampled = texture(uValues, vUV);
    float value = uBytes > 0.5
      ? dot(floor(sampled * 255.0 + 0.5), uPlaces)
      : sampled.r;

    if (uSignedAt > 0.0 && value >= uSignedAt) {
      value -= 2.0 * uSignedAt;
    }

    if (value == 0.0 || !(abs(value) <= MAX_FINITE)) {
      finalColor = vec4(0.0);
      return;
    }

    vec4 color;

    if (uMode < 0.5) {
      float alpha = uMax == 0.0 ? 1.0 : min(uMax, abs(value)) / uMax;
      color = texelFetch(uRamp, ivec2(0, 0), 0);
      color.a *= floor(alpha * 255.0 + 0.5) / 255.0;
    } else {
      if (value < uRange.x) {
        finalColor = vec4(0.0);
        return;
      }

      float position =
        max(min(value, uRange.y) - uRange.x, 0.0) / (uRange.y - uRange.x);
      float index = floor(position * (uRampLength - 1.0) + 0.5);
      color = texelFetch(uRamp, ivec2(int(index), 0), 0);
    }

    finalColor = vec4(color.rgb * color.a, color.a) * vColor;
  }
`;

/** How a map's values are laid out for upload; see {@link packValues}. */
export interface PackedValues {
  data: Uint8Array | Float32Array;
  /** Texture width in texels; padded so every row is 4-byte aligned. */
  textureWidth: number;
  format: "r8unorm" | "rg8unorm" | "rgba8unorm" | "r32float";
  /** The fraction of the texture width the image actually occupies. */
  uvScaleX: number;
  /** Per-channel byte weights for an integer map; zero for a float one. */
  places: readonly [number, number, number, number];
  /** Two's-complement threshold for a signed integer map, else 0. */
  signedAt: number;
}

const BYTE_LAYOUTS = {
  1: { format: "r8unorm", places: [1, 0, 0, 0] },
  2: { format: "rg8unorm", places: [1, 256, 0, 0] },
  4: { format: "rgba8unorm", places: [1, 256, 65536, 16777216] },
} as const;

const bytesOf = (values: TypedArray): Uint8Array =>
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength);

/**
 * Lays the values out for upload, copying only when it has to.
 *
 * Integer maps go up as their own bytes — a `Uint16Array` is already the
 * low/high byte pairs an RG8 texel holds — and floats as R32F. WebGL reads
 * texel rows at a 4-byte alignment, so a one- or two-byte layout whose rows
 * are not a multiple of 4 bytes is copied into padded rows, exactly as
 * `packIndices` does. A `Float64Array` has no WebGL2 texture format and is
 * narrowed to 32 bits, the one per-pixel pass left on this path.
 */
export const packValues = (image: ScalarImage): PackedValues => {
  const { values, width, height } = image;

  if (values instanceof Float32Array || values instanceof Float64Array) {
    return {
      data: values instanceof Float32Array ? values : Float32Array.from(values),
      textureWidth: width,
      format: "r32float",
      uvScaleX: 1,
      places: [0, 0, 0, 0],
      signedAt: 0,
    };
  }

  const bytesPerTexel = values.BYTES_PER_ELEMENT as 1 | 2 | 4;
  const { format, places } = BYTE_LAYOUTS[bytesPerTexel];
  const signedAt =
    values instanceof Int8Array ||
    values instanceof Int16Array ||
    values instanceof Int32Array
      ? 2 ** (8 * bytesPerTexel - 1)
      : 0;
  const bytes = bytesOf(values);
  const textureWidth = alignUp(width, 4 / bytesPerTexel);

  if (textureWidth === width) {
    return { data: bytes, textureWidth, format, uvScaleX: 1, places, signedAt };
  }

  const rowBytes = width * bytesPerTexel;
  const paddedRowBytes = textureWidth * bytesPerTexel;
  const data = new Uint8Array(paddedRowBytes * height);

  for (let row = 0; row < height; row++) {
    data.set(
      bytes.subarray(row * rowBytes, row * rowBytes + rowBytes),
      row * paddedRowBytes,
    );
  }

  return {
    data,
    textureWidth,
    format,
    uvScaleX: width / textureWidth,
    places,
    signedAt,
  };
};

const createUniforms = () =>
  new PIXI.UniformGroup({
    uRange: { value: new Float32Array(2), type: "vec2<f32>" },
    uMax: { value: 0, type: "f32" },
    uMode: { value: 0, type: "f32" },
    uRampLength: { value: 1, type: "f32" },
    uPlaces: { value: new Float32Array(4), type: "vec4<f32>" },
    uBytes: { value: 0, type: "f32" },
    uSignedAt: { value: 0, type: "f32" },
  });

/**
 * A unit quad that draws a {@link ScalarImage}: the values as a texture, the
 * colors as a one-row ramp, and the range and mode as uniforms. Like
 * {@link IndexedMaskMesh}, `setImage` uploads a texture only when its source
 * array changed by identity — and a range or mode change uploads nothing.
 */
export class ScalarMaskMesh extends PIXI.Mesh<
  PIXI.MeshGeometry,
  PaletteShader
> {
  #values?: ScalarImage["values"];
  #ramp?: Uint8Array;
  #valueSource?: PIXI.BufferImageSource;
  #rampSource?: PIXI.BufferImageSource;
  readonly #uniforms: ReturnType<typeof createUniforms>;
  readonly #uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

  constructor() {
    const uniforms = createUniforms();
    const shader = new PaletteShader({
      glProgram: PIXI.GlProgram.from({
        vertex: MASK_VERTEX,
        fragment: FRAGMENT,
        // An R32F value read at mediump is a half float on mobile GPUs:
        // three significant digits, far too few to place a value in range.
        preferredFragmentPrecision: "highp",
      }),
      resources: {
        uValues: PIXI.Texture.EMPTY.source,
        uRamp: PIXI.Texture.EMPTY.source,
        scalarUniforms: uniforms,
      },
    });
    super({ geometry: createUnitQuad(), shader });
    this.#uniforms = uniforms;
  }

  setImage(image: ScalarImage): void {
    if (image.values !== this.#values) {
      this.#values = image.values;
      this.uploadValues(image);
    }

    if (image.ramp !== this.#ramp) {
      this.#ramp = image.ramp;
      this.uploadRamp(image.ramp);
    }

    const uniforms = this.#uniforms.uniforms;
    const [start, stop] = image.range;
    uniforms.uRange[0] = start;
    uniforms.uRange[1] = stop;
    uniforms.uMax = Math.max(Math.abs(start), Math.abs(stop));
    uniforms.uMode = image.mode === "value" ? 1 : 0;
    uniforms.uRampLength = Math.max(1, image.ramp.length / 4);
    this.#uniforms.update();
  }

  private uploadValues(image: ScalarImage): void {
    const packed = packValues(image);
    const current = this.#valueSource;

    if (
      current &&
      current.width === packed.textureWidth &&
      current.height === image.height &&
      current.format === packed.format
    ) {
      current.resource = packed.data;
      current.update();
    } else {
      current?.destroy();
      this.#valueSource = bufferSource(
        packed.data,
        packed.textureWidth,
        image.height,
        packed.format,
      );
      this.shader!.resources.uValues = this.#valueSource;
    }

    const uniforms = this.#uniforms.uniforms;
    uniforms.uPlaces.set(packed.places);
    uniforms.uBytes = packed.format === "r32float" ? 0 : 1;
    uniforms.uSignedAt = packed.signedAt;

    // Only the image's own columns are sampled; the padding stays offscreen.
    const uvs = this.#uvs;
    uvs[2] = uvs[4] = packed.uvScaleX;
    this.geometry.getBuffer("aUV").data = uvs;
  }

  private uploadRamp(ramp: Uint8Array): void {
    const entries = Math.max(1, ramp.length / 4);
    const current = this.#rampSource;

    if (current && current.width === entries) {
      current.resource = ramp;
      current.update();
      return;
    }

    current?.destroy();
    this.#rampSource = bufferSource(ramp, entries, 1, "rgba8unorm");
    this.shader!.resources.uRamp = this.#rampSource;
  }

  override destroy(options?: PIXI.DestroyOptions): void {
    // As `IndexedMaskMesh`: the geometry and shader are owned here, the
    // program is shared.
    const geometry = this.geometry;
    const shader = this.shader;
    this.#valueSource?.destroy();
    this.#rampSource?.destroy();
    this.#valueSource = undefined;
    this.#rampSource = undefined;
    this.#values = undefined;
    this.#ramp = undefined;
    super.destroy(options);
    geometry?.destroy(true);
    shader?.destroy(false);
  }
}
