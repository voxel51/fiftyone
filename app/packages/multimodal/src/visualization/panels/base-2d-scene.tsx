/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { VISUALIZATION_PANEL_BACKGROUND_COLOR } from "./style-tokens";

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
}

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
}: ImageTexturePlaneProps) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const scale = useMemo(
    () =>
      imagePlaneScale(
        textureHandle?.aspectRatio ?? 1,
        size.width,
        size.height,
        fit
      ),
    [fit, size.height, size.width, textureHandle?.aspectRatio]
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, scale, textureHandle]);

  if (!textureHandle) {
    return null;
  }

  return (
    <mesh frustumCulled={false} scale={scale}>
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
  );
}

function imagePlaneScale(
  aspectRatio: number,
  width: number,
  height: number,
  fit: "contain" | "cover"
): [number, number, number] {
  const viewportAspect = width / Math.max(1, height);
  const imageIsWider = aspectRatio > viewportAspect;
  const constrainByWidth = fit === "contain" ? imageIsWider : !imageIsWider;
  const planeWidth = constrainByWidth ? width : height * aspectRatio;
  const planeHeight = constrainByWidth ? width / aspectRatio : height;

  return [Math.max(1, planeWidth), Math.max(1, planeHeight), 1];
}
