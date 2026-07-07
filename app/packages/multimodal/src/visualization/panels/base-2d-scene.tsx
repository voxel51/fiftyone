/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

/**
 * Screen-space transform for an image fitted into a 2D panel.
 */
export interface ImageViewTransform {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

/**
 * CSS-pixel dimensions shared by 2D panel layout helpers.
 */
export interface ImageDisplaySize {
  readonly height: number;
  readonly width: number;
}

/**
 * CSS-pixel rect for an image displayed inside a panel.
 */
export interface ImageDisplayRect extends ImageDisplaySize {
  readonly x: number;
  readonly y: number;
}

/**
 * Loaded Three.js texture plus image aspect ratio and disposal hook.
 */
export interface ImageTextureHandle {
  readonly aspectRatio: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly dispose: () => void;
  readonly texture: THREE.Texture;
}

/**
 * Props for the shared 2D visualization scene shell.
 */
export interface Base2DSceneProps {
  readonly children?: ReactNode;
}

/**
 * Props for rendering an image texture into the 2D scene.
 */
export interface ImageTexturePlaneProps {
  readonly fit: "contain" | "cover";
  readonly textureHandle: ImageTextureHandle | null;
  readonly viewTransform?: ImageViewTransform;
}

export const DEFAULT_IMAGE_VIEW_TRANSFORM: ImageViewTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

const DEFAULT_MAX_IMAGE_VIEW_SCALE = 16;
const DEFAULT_MIN_IMAGE_VIEW_SCALE = 1;
const VIEW_TRANSFORM_EPSILON = 0.000001;

/**
 * Base 2D R3F scene for image-like renderables.
 */
export function Base2DScene({ children }: Base2DSceneProps) {
  return (
    <>
      <color
        args={[VISUALIZATION_PANEL_BACKGROUND_COLOR]}
        attach="background"
      />
      {children}
    </>
  );
}

/**
 * Image attachment point for the base 2D scene.
 */
export function ImageTexturePlane({
  fit,
  textureHandle,
  viewTransform,
}: ImageTexturePlaneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const planeScale = useMemo(
    () =>
      imagePlaneScale(
        textureHandle?.aspectRatio ?? 1,
        size.width,
        size.height,
        fit,
      ),
    [fit, size.height, size.width, textureHandle?.aspectRatio],
  );
  const normalizedViewTransform = normalizeImageViewTransform(viewTransform);

  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    planeScale,
    textureHandle,
    normalizedViewTransform.scale,
    normalizedViewTransform.translateX,
    normalizedViewTransform.translateY,
  ]);

  if (!textureHandle) {
    return null;
  }

  return (
    <group
      position={[
        normalizedViewTransform.translateX,
        -normalizedViewTransform.translateY,
        0,
      ]}
      scale={[normalizedViewTransform.scale, normalizedViewTransform.scale, 1]}
    >
      <mesh frustumCulled={false} scale={planeScale}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          transparent
        >
          <primitive attach="map" object={textureHandle.texture} />
        </meshBasicMaterial>
      </mesh>
    </group>
  );
}

export function imageDisplayRect(
  container: ImageDisplaySize,
  imageSize: ImageDisplaySize,
  fit: "contain" | "cover",
): ImageDisplayRect {
  const containerAspect = container.width / Math.max(1, container.height);
  const imageAspect = imageSize.width / Math.max(1, imageSize.height);
  const imageIsWider = imageAspect > containerAspect;
  const constrainByWidth = fit === "contain" ? imageIsWider : !imageIsWider;
  const width = constrainByWidth
    ? container.width
    : container.height * imageAspect;
  const height = constrainByWidth
    ? container.width / imageAspect
    : container.height;

  return {
    height,
    width,
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
  };
}

export function transformedImageDisplayRect(
  rect: ImageDisplayRect,
  viewTransform: ImageViewTransform | undefined,
): ImageDisplayRect {
  const transform = normalizeImageViewTransform(viewTransform);
  const width = rect.width * transform.scale;
  const height = rect.height * transform.scale;

  return {
    height,
    width,
    x: rect.x + (rect.width - width) / 2 + transform.translateX,
    y: rect.y + (rect.height - height) / 2 + transform.translateY,
  };
}

export function clampImageViewTransform(
  viewTransform: ImageViewTransform,
  {
    containerSize,
    fit,
    imageSize,
    maxScale = DEFAULT_MAX_IMAGE_VIEW_SCALE,
    minScale = DEFAULT_MIN_IMAGE_VIEW_SCALE,
  }: {
    readonly containerSize: ImageDisplaySize | null;
    readonly fit: "contain" | "cover";
    readonly imageSize: ImageDisplaySize | null;
    readonly maxScale?: number;
    readonly minScale?: number;
  },
): ImageViewTransform {
  const scale = clampFinite(
    viewTransform.scale,
    Math.min(minScale, maxScale),
    Math.max(minScale, maxScale),
  );

  if (
    !containerSize ||
    !imageSize ||
    containerSize.width <= 0 ||
    containerSize.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return {
      ...DEFAULT_IMAGE_VIEW_TRANSFORM,
      scale,
    };
  }

  const rect = imageDisplayRect(containerSize, imageSize, fit);
  const maxTranslateX = maxImagePanDistance(
    rect.width,
    containerSize.width,
    scale,
  );
  const maxTranslateY = maxImagePanDistance(
    rect.height,
    containerSize.height,
    scale,
  );

  return {
    scale,
    translateX: clampFinite(
      viewTransform.translateX,
      -maxTranslateX,
      maxTranslateX,
    ),
    translateY: clampFinite(
      viewTransform.translateY,
      -maxTranslateY,
      maxTranslateY,
    ),
  };
}

export function imageViewTransformEquals(
  first: ImageViewTransform,
  second: ImageViewTransform,
  epsilon = VIEW_TRANSFORM_EPSILON,
): boolean {
  return (
    Math.abs(first.scale - second.scale) <= epsilon &&
    Math.abs(first.translateX - second.translateX) <= epsilon &&
    Math.abs(first.translateY - second.translateY) <= epsilon
  );
}

function normalizeImageViewTransform(
  viewTransform: ImageViewTransform | undefined,
): ImageViewTransform {
  if (!viewTransform) {
    return DEFAULT_IMAGE_VIEW_TRANSFORM;
  }

  return {
    scale: Number.isFinite(viewTransform.scale)
      ? Math.max(VIEW_TRANSFORM_EPSILON, viewTransform.scale)
      : DEFAULT_IMAGE_VIEW_TRANSFORM.scale,
    translateX: Number.isFinite(viewTransform.translateX)
      ? viewTransform.translateX
      : DEFAULT_IMAGE_VIEW_TRANSFORM.translateX,
    translateY: Number.isFinite(viewTransform.translateY)
      ? viewTransform.translateY
      : DEFAULT_IMAGE_VIEW_TRANSFORM.translateY,
  };
}

function clampFinite(value: number, min: number, max: number): number {
  if (min === 0 && max === 0) {
    return 0;
  }

  if (!Number.isFinite(value)) {
    return min;
  }

  if (value <= min) {
    return min;
  }

  if (value >= max) {
    return max;
  }

  return value;
}

function maxImagePanDistance(
  fittedLength: number,
  containerLength: number,
  scale: number,
): number {
  const scaledLength = fittedLength * scale;

  if (
    Math.abs(scale - DEFAULT_IMAGE_VIEW_TRANSFORM.scale) <=
    VIEW_TRANSFORM_EPSILON
  ) {
    return Math.max(0, (scaledLength - containerLength) / 2);
  }

  return Math.abs(scaledLength - containerLength) / 2;
}

function imagePlaneScale(
  aspectRatio: number,
  width: number,
  height: number,
  fit: "contain" | "cover",
): [number, number, number] {
  const rect = imageDisplayRect(
    { height, width },
    { height: 1, width: aspectRatio },
    fit,
  );

  return [Math.max(1, rect.width), Math.max(1, rect.height), 1];
}
