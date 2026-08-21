import { describe, expect, it } from "vitest";
import * as THREE from "three";

import type { RawImageVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import {
  createDepthImageMaterial,
  updateDepthImageMaterial,
} from "./depth-image-material";
import { createImageTexture } from "./image-texture";

describe("createImageTexture", () => {
  it("rejects truncated raw RGBA frames before GPU upload", async () => {
    await expect(
      createImageTexture(rawFrame([255, 0, 0, 255])),
    ).rejects.toThrow("Raw image frame has too few RGBA bytes");
  });

  it("uploads 16UC1 as a native-width unsigned integer red texture", async () => {
    const frame = depthFrame(new Uint16Array([0, 1_000, 2_000]), 1_000, 2_000);
    const handle = await createImageTexture(frame);
    const texture = handle.texture as THREE.DataTexture & {
      normalized: boolean;
    };

    expect(texture.format).toBe(THREE.RedFormat);
    expect(texture.type).toBe(THREE.UnsignedIntType);
    expect(texture.internalFormat).toBe("r16uint");
    expect(texture.normalized).toBe(false);
    expect(texture.image.data).toBe(frame.depth?.values);
    expect(texture.flipY).toBe(false);
    expect(texture.unpackAlignment).toBe(1);
    expect(handle.decodedByteLength).toBe(6);
    expect(handle.depthDisplay).toEqual({
      maxSampleValue: 2_000,
      minSampleValue: 1_000,
    });

    const material = createDepthImageMaterial(handle, {
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    expect(material.colorNode).not.toBeNull();
    expect(material.opacityNode).not.toBeNull();
    expect(textureSamplerMode(material.opacityNode, texture)).toBe(false);
    expect(material.side).toBe(THREE.DoubleSide);
    const colorNode = material.colorNode;
    const opacityNode = material.opacityNode;
    const nextHandle = await createImageTexture(
      depthFrame(new Uint16Array([500, 1_500, 2_500]), 500, 2_500),
    );
    updateDepthImageMaterial(material, nextHandle, 0.75);
    expect(material.colorNode).toBe(colorNode);
    expect(material.opacityNode).toBe(opacityNode);
    expect(textureSamplerMode(material.opacityNode, nextHandle.texture)).toBe(
      false,
    );
    expect(material.opacity).toBe(0.75);
    nextHandle.dispose();
    material.dispose();
    handle.dispose();
  });

  it("uploads 32FC1 as a native float red texture", async () => {
    const frame = depthFrame(new Float32Array([Number.NaN, 1.5, 3]), 1.5, 3);
    const handle = await createImageTexture(frame);
    const texture = handle.texture as THREE.DataTexture;

    expect(texture.format).toBe(THREE.RedFormat);
    expect(texture.type).toBe(THREE.FloatType);
    expect(texture.image.data).toBe(frame.depth?.values);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(handle.decodedByteLength).toBe(12);
    expect(handle.depthDisplay).toEqual({
      maxSampleValue: 3,
      minSampleValue: 1.5,
    });
    const material = createDepthImageMaterial(handle);
    expect(textureSamplerMode(material.opacityNode, texture)).toBe(false);
    material.dispose();
    handle.dispose();
  });

  it("builds an all-transparent material for an all-invalid depth range", async () => {
    const handle = await createImageTexture(
      depthFrame(new Float32Array([0, Number.NaN]), null, null),
    );

    expect(handle.depthDisplay).toEqual({
      maxSampleValue: null,
      minSampleValue: null,
    });
    const material = createDepthImageMaterial(handle);
    expect(material.colorNode).not.toBeNull();
    expect(material.opacity).toBe(0);
    material.dispose();
    handle.dispose();
  });
});

function rawFrame(rgba: readonly number[]): RawImageVisualization {
  return {
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(rgba),
    sourceEncoding: "rgb8",
    width: 2,
  };
}

function depthFrame(
  values: Uint16Array | Float32Array,
  minValue: number | null,
  maxValue: number | null,
): RawImageVisualization {
  return {
    depth: {
      maxValue,
      metersPerUnit: values instanceof Uint16Array ? 0.001 : 1,
      minValue,
      values,
    },
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(0),
    sourceEncoding: values instanceof Uint16Array ? "16UC1" : "32FC1",
    width: values.length,
  };
}

function textureSamplerMode(
  root: unknown,
  texture: THREE.Texture,
): boolean | null {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): boolean | null => {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return null;
    }
    seen.add(value);
    if (
      "value" in value &&
      value.value === texture &&
      "sampler" in value &&
      typeof value.sampler === "boolean"
    ) {
      return value.sampler;
    }
    for (const child of Object.values(value)) {
      const sampler = visit(child);
      if (sampler !== null) return sampler;
    }
    return null;
  };
  return visit(root);
}
