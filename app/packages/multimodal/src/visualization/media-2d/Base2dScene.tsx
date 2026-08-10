/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import * as THREE from "three";

import { fittedImageSize } from "./image-fit";
import {
  createDepthImageMaterial,
  updateDepthImageMaterial,
} from "./depth-image-material";
import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "../panel-ui/style-tokens";
import type {
  Base2dSceneProps,
  ImageDisplayRect,
  ImageDisplaySize,
  ImageTextureMesh,
  ImageTexturePlaneProps,
  ImageViewTransform,
} from "./image-scene-types";

export type {
  Base2dSceneProps,
  ImageDisplayRect,
  ImageDisplaySize,
  ImageTextureHandle,
  ImageTextureMesh,
  ImageTexturePlaneProps,
  ImageViewTransform,
} from "./image-scene-types";

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
export function Base2dScene({ background = true, children }: Base2dSceneProps) {
  return (
    <>
      {background ? (
        <color
          args={[VISUALIZATION_PANEL_BACKGROUND_COLOR]}
          attach="background"
        />
      ) : null}
      {children}
    </>
  );
}

/**
 * Image attachment point for the base 2D scene.
 */
export function ImageTexturePlane({
  children,
  fit,
  textureMesh,
  textureHandle,
  viewTransform,
}: ImageTexturePlaneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const bindMaterial = useCallback((material: unknown) => {
    materialRef.current = material as THREE.MeshBasicMaterial | null;
  }, []);
  const size = useThree((state) => state.size);
  const remapGeometry = useMemo(
    () => (textureMesh ? imageTextureMeshGeometry(textureMesh) : null),
    [textureMesh],
  );
  const depthTextureType = textureHandle?.depthDisplay
    ? textureHandle.texture.type
    : null;
  const depthMaterial = useMemo(
    () =>
      textureHandle?.depthDisplay
        ? createDepthImageMaterial(textureHandle, {
            depthTest: false,
            depthWrite: false,
          })
        : null,
    // The node graph is encoding-specific but its texture/range are uniforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [depthTextureType],
  );
  // This effect disposes the texture-remap mesh when it is replaced.
  useEffect(() => () => remapGeometry?.dispose(), [remapGeometry]);
  // Node materials are renderer resources just like the texture lease.
  useEffect(() => () => depthMaterial?.dispose(), [depthMaterial]);
  const planeScale = useMemo(
    () =>
      imagePlaneScale(
        textureMesh
          ? textureMesh.displayWidth / Math.max(1, textureMesh.displayHeight)
          : (textureHandle?.aspectRatio ?? 1),
        size.width,
        size.height,
        fit,
      ),
    [fit, size.height, size.width, textureHandle?.aspectRatio, textureMesh],
  );
  const normalizedViewTransform = normalizeImageViewTransform(viewTransform);

  // This effect invalidates the demand-rendered scene when its view changes.
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

  // This layout effect binds the decoded texture before the browser paints.
  useLayoutEffect(() => {
    if (depthMaterial && textureHandle?.depthDisplay) {
      updateDepthImageMaterial(depthMaterial, textureHandle);
      invalidate();
      return;
    }
    const material = materialRef.current;
    const texture = textureHandle?.texture ?? null;
    if (!material || !texture) {
      return;
    }

    replaceImageMaterialTexture(material, texture);
    invalidate();
  }, [depthMaterial, invalidate, textureHandle]);

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
      <group scale={planeScale}>
        <mesh frustumCulled={false}>
          {remapGeometry ? (
            <primitive attach="geometry" object={remapGeometry} />
          ) : (
            <planeGeometry args={[1, 1]} />
          )}
          {depthMaterial ? (
            <primitive attach="material" object={depthMaterial} />
          ) : (
            <meshBasicMaterial
              depthTest={false}
              depthWrite={false}
              ref={bindMaterial}
              toneMapped={false}
              transparent
            />
          )}
        </mesh>
        {children}
      </group>
    </group>
  );
}

/** Converts a renderer-neutral cached mesh into one renderer-owned geometry. */
export function imageTextureMeshGeometry(
  mesh: ImageTextureMesh,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(mesh.positions, 3),
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** Rebinds a decoded frame and invalidates Three's WebGPU bind-group cache. */
export function replaceImageMaterialTexture(
  material: THREE.MeshBasicMaterial,
  texture: THREE.Texture,
): void {
  if (material.map === texture) {
    return;
  }

  material.map = texture;
  material.needsUpdate = true;
}

/** Returns the centered destination rect for an image fitted into a panel. */
export function imageDisplayRect(
  container: ImageDisplaySize,
  imageSize: ImageDisplaySize,
  fit: "contain" | "cover",
): ImageDisplayRect {
  const { height, width } = fittedImageSize(container, imageSize, fit);

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
