import type { Texture } from "three";
import type { CameraIntrinsics } from "./types";

/**
 * Pixel dimensions resolved from a loaded texture image.
 */
export interface TextureDimensions {
  width: number;
  height: number;
}

type DimensionBearingImage = {
  naturalWidth?: number;
  naturalHeight?: number;
  videoWidth?: number;
  videoHeight?: number;
  width?: number;
  height?: number;
};

function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function resolveTextureDimension(values: unknown[]): number | undefined {
  for (const value of values) {
    const numericValue = asPositiveNumber(value);
    if (numericValue) {
      return numericValue;
    }
  }

  return undefined;
}

/**
 * Extracts usable pixel dimensions from a loaded Three.js texture.
 *
 * Prefers natural image dimensions when available, then falls back to video or
 * generic width/height fields exposed on the underlying image object.
 */
export function getTextureDimensions(
  texture: Texture | null | undefined
): TextureDimensions | undefined {
  const image = texture?.image as DimensionBearingImage | undefined;

  if (!image || typeof image !== "object") {
    return undefined;
  }

  const width = resolveTextureDimension([
    image.naturalWidth,
    image.videoWidth,
    image.width,
  ]);
  const height = resolveTextureDimension([
    image.naturalHeight,
    image.videoHeight,
    image.height,
  ]);

  if (!width || !height) {
    return undefined;
  }

  return { width, height };
}

/**
 * Backfills missing intrinsics image dimensions from the loaded texture.
 *
 * Explicit width/height already provided by the dataset take precedence over
 * any dimensions discovered from the texture itself.
 */
export function applyTextureDimensionsToIntrinsics(
  intrinsics: CameraIntrinsics | null,
  textureDimensions: TextureDimensions | undefined
): CameraIntrinsics | null {
  if (!intrinsics || !textureDimensions) {
    return intrinsics;
  }

  if (intrinsics.width != null && intrinsics.height != null) {
    return intrinsics;
  }

  return {
    ...intrinsics,
    width: intrinsics.width ?? textureDimensions.width,
    height: intrinsics.height ?? textureDimensions.height,
  };
}
