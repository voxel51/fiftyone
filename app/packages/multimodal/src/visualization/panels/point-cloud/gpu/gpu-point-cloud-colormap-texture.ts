import * as THREE from "three";

import {
  createPointCloudColormapLookup,
  pointCloudColormapKey,
  type PointCloudColormap,
} from "../colormaps";

const LUT_SIZE = 256;
const RGB_COMPONENT_COUNT = 3;
const RGBA_COMPONENT_COUNT = 4;

const textures = new Map<string, THREE.DataTexture>();

/** Shared 256x1 GPU lookup texture for a normalized pointcloud colormap. */
export function getGpuPointCloudColormapTexture(
  colormap: PointCloudColormap,
): THREE.DataTexture {
  const key = pointCloudColormapKey(colormap);
  const cached = textures.get(key);
  if (cached) {
    return cached;
  }

  const lookup = createPointCloudColormapLookup(colormap, LUT_SIZE);
  const rgba = new Uint8Array(lookup.size * RGBA_COMPONENT_COUNT);
  for (let index = 0; index < lookup.size; index++) {
    const sourceOffset = index * RGB_COMPONENT_COUNT;
    const targetOffset = index * RGBA_COMPONENT_COUNT;
    rgba[targetOffset] = Math.round(lookup.colors[sourceOffset] * 255);
    rgba[targetOffset + 1] = Math.round(lookup.colors[sourceOffset + 1] * 255);
    rgba[targetOffset + 2] = Math.round(lookup.colors[sourceOffset + 2] * 255);
    rgba[targetOffset + 3] = 255;
  }

  const texture = new THREE.DataTexture(
    rgba,
    lookup.size,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  textures.set(key, texture);
  return texture;
}

/** Session/test boundary cleanup for cached colormap GPU resources. */
export function releaseGpuPointCloudColormapTextures(): void {
  for (const texture of textures.values()) {
    texture.dispose();
  }
  textures.clear();
}

/** Returns the number of cached GPU colormap textures. */
export function gpuPointCloudColormapTextureStats(): {
  readonly entryCount: number;
} {
  return { entryCount: textures.size };
}
