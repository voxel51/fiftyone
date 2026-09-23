/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import * as PIXI from "pixi.js";
import { INDEXED_LUT_SIDE as LUT_SIDE, type IndexedImage } from "./Renderer2D";

/**
 * Pixi binds two uniform groups onto every mesh shader by name: the global
 * projection / world transform, and the mesh's own transform and color.
 * Declaring only what this shader reads is fine — the sync skips the rest.
 */
const VERTEX = /* glsl */ `
  in vec2 aPosition;
  in vec2 aUV;

  out vec2 vUV;
  out vec4 vColor;

  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;
  uniform vec4 uColor;

  void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUV = aUV;
    vColor = uColor;
  }
`;

/**
 * The palette lookup. The index texture is single-channel for 8-bit masks
 * and two-channel (low byte, high byte) for 16-bit ones; a single-channel
 * texture samples 0 for green, so one expression serves both. The LUT is
 * stored with straight alpha and premultiplied here, which is what Pixi's
 * blend state expects, then scaled by the mesh's own color and alpha.
 */
const FRAGMENT = /* glsl */ `
  in vec2 vUV;
  in vec4 vColor;

  out vec4 finalColor;

  uniform sampler2D uIndices;
  uniform sampler2D uPalette;

  void main() {
    vec4 sampled = texture(uIndices, vUV);
    float low = floor(sampled.r * 255.0 + 0.5);
    float high = floor(sampled.g * 255.0 + 0.5);
    vec2 lutUv = vec2((low + 0.5) / ${LUT_SIDE}.0, (high + 0.5) / ${LUT_SIDE}.0);
    vec4 color = texture(uPalette, lutUv);
    finalColor = vec4(color.rgb * color.a, color.a) * vColor;
  }
`;

/** What the index texture is built from; see {@link packIndices}. */
interface PackedIndices {
  data: Uint8Array;
  /** Texture width in texels; padded so every row is 4-byte aligned. */
  textureWidth: number;
  format: "r8unorm" | "rg8unorm";
  /** The fraction of the texture width the image actually occupies. */
  uvScaleX: number;
}

const alignUp = (value: number, to: number): number =>
  Math.ceil(value / to) * to;

/**
 * Lays the indices out for upload. WebGL reads texel rows at a 4-byte
 * alignment, so a single-channel texture whose width is not a multiple of 4
 * (or a two-channel one whose width is odd) would shear; those get copied
 * into a padded row. An 8-bit mask with an aligned width uploads as-is.
 */
export const packIndices = (image: IndexedImage): PackedIndices => {
  const { indices, width, height } = image;

  if (indices instanceof Uint8Array) {
    const textureWidth = alignUp(width, 4);
    if (textureWidth === width) {
      return { data: indices, textureWidth, format: "r8unorm", uvScaleX: 1 };
    }
    const data = new Uint8Array(textureWidth * height);
    for (let row = 0; row < height; row++) {
      data.set(
        indices.subarray(row * width, row * width + width),
        row * textureWidth,
      );
    }
    return {
      data,
      textureWidth,
      format: "r8unorm",
      uvScaleX: width / textureWidth,
    };
  }

  // Two bytes per texel; rows of `textureWidth * 2` bytes need an even width.
  const textureWidth = alignUp(width, 2);
  const data = new Uint8Array(textureWidth * height * 2);
  for (let row = 0; row < height; row++) {
    let out = row * textureWidth * 2;
    const start = row * width;
    for (let x = 0; x < width; x++) {
      const value = indices[start + x];
      data[out++] = value & 0xff;
      data[out++] = value >>> 8;
    }
  }
  return {
    data,
    textureWidth,
    format: "rg8unorm",
    uvScaleX: width / textureWidth,
  };
};

const UNIT_POSITIONS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
const UNIT_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

/**
 * `Mesh` types its shader as one that carries a `texture`, because its own
 * material samples one. This shader samples two, so the property is a stub:
 * the mesh never reads it for anything but the default material path.
 */
class PaletteShader extends PIXI.Shader implements PIXI.TextureShader {
  texture: PIXI.Texture = PIXI.Texture.EMPTY;
}

const bufferSource = (
  data: Uint8Array,
  width: number,
  height: number,
  format: PackedIndices["format"] | "rgba8unorm",
): PIXI.BufferImageSource =>
  new PIXI.BufferImageSource({
    resource: data,
    width,
    height,
    format,
    alphaMode: "no-premultiply-alpha",
    scaleMode: "nearest",
  });

/**
 * A unit quad that draws an {@link IndexedImage} through the palette shader.
 * Positioned and scaled by the renderer like a sprite; `setImage` uploads
 * whichever of the two textures changed, by identity, so a repaint with the
 * same indices and the same LUT uploads nothing.
 */
export class IndexedMaskMesh extends PIXI.Mesh<
  PIXI.MeshGeometry,
  PaletteShader
> {
  #indices?: IndexedImage["indices"];
  #lut?: Uint8Array;
  #indexSource?: PIXI.BufferImageSource;
  #lutSource?: PIXI.BufferImageSource;
  readonly #uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

  constructor() {
    const geometry = new PIXI.MeshGeometry({
      positions: new Float32Array(UNIT_POSITIONS),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array(UNIT_INDICES),
    });
    const shader = new PaletteShader({
      glProgram: PIXI.GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT }),
      resources: {
        uIndices: PIXI.Texture.EMPTY.source,
        uPalette: PIXI.Texture.EMPTY.source,
      },
    });
    super({ geometry, shader });
  }

  setImage(image: IndexedImage): void {
    if (image.indices !== this.#indices) {
      this.#indices = image.indices;
      this.uploadIndices(image);
    }

    if (image.lut !== this.#lut) {
      this.#lut = image.lut;
      this.uploadLut(image.lut);
    }
  }

  private uploadIndices(image: IndexedImage): void {
    const packed = packIndices(image);
    const current = this.#indexSource;

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
      this.#indexSource = bufferSource(
        packed.data,
        packed.textureWidth,
        image.height,
        packed.format,
      );
      this.shader!.resources.uIndices = this.#indexSource;
    }

    // Only the image's own columns are sampled; the padding stays offscreen.
    const uvs = this.#uvs;
    uvs[2] = uvs[4] = packed.uvScaleX;
    this.geometry.getBuffer("aUV").data = uvs;
  }

  private uploadLut(lut: Uint8Array): void {
    const current = this.#lutSource;

    if (current) {
      current.resource = lut;
      current.update();
      return;
    }

    this.#lutSource = bufferSource(lut, LUT_SIDE, LUT_SIDE, "rgba8unorm");
    this.shader!.resources.uPalette = this.#lutSource;
  }

  override destroy(options?: PIXI.DestroyOptions): void {
    this.#indexSource?.destroy();
    this.#lutSource?.destroy();
    this.#indexSource = undefined;
    this.#lutSource = undefined;
    this.#indices = undefined;
    this.#lut = undefined;
    super.destroy(options);
  }
}
