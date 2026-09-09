import type { ImageViewTransform } from "./image-scene-types";
import { fittedImageSize } from "./image-fit";

/** Size of a fitted image plane in orthographic scene CSS-pixel units. */
export function imagePlaneSize({
  containerHeight,
  containerWidth,
  fit,
  imageHeight,
  imageWidth,
}: {
  readonly containerHeight: number;
  readonly containerWidth: number;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
}): { readonly height: number; readonly width: number } {
  return fittedImageSize(
    {
      height: Math.max(1, containerHeight),
      width: Math.max(1, containerWidth),
    },
    { height: Math.max(1, imageHeight), width: Math.max(1, imageWidth) },
    fit,
  );
}

/** Projected image bounds in normalized viewport coordinates. */
export interface ImagePlaneViewportRect {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

/** Fitted image rectangle in top-left-origin viewport UVs. */
export function imagePlaneViewportRect({
  containerHeight,
  containerWidth,
  fit,
  imageHeight,
  imageWidth,
  viewTransform,
}: {
  readonly containerHeight: number;
  readonly containerWidth: number;
  readonly fit: "contain" | "cover";
  readonly imageHeight: number;
  readonly imageWidth: number;
  readonly viewTransform?: ImageViewTransform;
}): ImagePlaneViewportRect {
  const safeContainerHeight = Math.max(1, containerHeight);
  const safeContainerWidth = Math.max(1, containerWidth);
  const fitted = imagePlaneSize({
    containerHeight: safeContainerHeight,
    containerWidth: safeContainerWidth,
    fit,
    imageHeight,
    imageWidth,
  });
  const fittedX = (safeContainerWidth - fitted.width) / 2;
  const fittedY = (safeContainerHeight - fitted.height) / 2;
  const scale = Number.isFinite(viewTransform?.scale)
    ? Math.max(1e-6, viewTransform?.scale ?? 1)
    : 1;
  const translateX = Number.isFinite(viewTransform?.translateX)
    ? (viewTransform?.translateX ?? 0)
    : 0;
  const translateY = Number.isFinite(viewTransform?.translateY)
    ? (viewTransform?.translateY ?? 0)
    : 0;
  const width = fitted.width * scale;
  const height = fitted.height * scale;
  const x = fittedX + (fitted.width - width) / 2 + translateX;
  const y = fittedY + (fitted.height - height) / 2 + translateY;

  return {
    bottom: clamp01((y + height) / safeContainerHeight),
    left: clamp01(x / safeContainerWidth),
    right: clamp01((x + width) / safeContainerWidth),
    top: clamp01(y / safeContainerHeight),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
