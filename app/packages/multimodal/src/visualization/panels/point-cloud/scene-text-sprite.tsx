/* eslint-disable react/no-unknown-property */
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { RgbaColor, SceneTextPrimitive } from "../../../decoders";
import { scenePoseObjectTransform } from "./transforms";
import type { TextSpriteTexture } from "./types";
import { clamp01, rgbaCss } from "./utils";

const DEFAULT_SCENE_TEXT_COLOR: RgbaColor = [1, 1, 1, 1];
const SCENE_TEXT_FONT_FAMILY = "Inter, system-ui, sans-serif";
const SCENE_TEXT_MIN_CANVAS_FONT_SIZE = 12;
export const SCENE_TEXT_DEFAULT_WORLD_HEIGHT = 0.5;
const SCENE_TEXT_PADDING_PX = 4;

export function SceneTextSprite({
  textPrimitive,
}: {
  readonly textPrimitive: SceneTextPrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const spriteTexture = useMemo(
    () => createTextSpriteTexture(textPrimitive),
    [textPrimitive],
  );

  useEffect(() => {
    if (!spriteTexture) return;
    invalidate();
    return () => spriteTexture.texture.dispose();
  }, [invalidate, spriteTexture]);

  if (!spriteTexture) {
    return null;
  }

  const transform = scenePoseObjectTransform(textPrimitive.pose);
  const [, , , alpha] = textPrimitive.color ?? DEFAULT_SCENE_TEXT_COLOR;
  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const textureMap = spriteTexture.texture as never;
  const displayHeight = textPrimitive.scaleInvariant
    ? Math.max(SCENE_TEXT_MIN_CANVAS_FONT_SIZE, textPrimitive.fontSize || 0)
    : Math.max(
        SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
        textPrimitive.fontSize || SCENE_TEXT_DEFAULT_WORLD_HEIGHT,
      );

  if (!textPrimitive.billboard) {
    return (
      <group position={transform.position} quaternion={transform.quaternion}>
        <mesh
          frustumCulled={false}
          scale={[displayHeight * spriteTexture.aspectRatio, displayHeight, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={textureMap}
            opacity={clamp01(alpha)}
            side={THREE.DoubleSide}
            transparent
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <sprite
        frustumCulled={false}
        scale={[displayHeight * spriteTexture.aspectRatio, displayHeight, 1]}
      >
        <spriteMaterial
          map={textureMap}
          opacity={clamp01(alpha)}
          sizeAttenuation={!textPrimitive.scaleInvariant}
          transparent
        />
      </sprite>
    </group>
  );
}

function createTextSpriteTexture(
  textPrimitive: SceneTextPrimitive,
): TextSpriteTexture | null {
  if (!textPrimitive.text || typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const fontSize = Math.max(
    SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
    textPrimitive.fontSize || SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
  );
  const font = `${fontSize}px ${SCENE_TEXT_FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(textPrimitive.text);
  const width = Math.max(
    1,
    Math.ceil(metrics.width + SCENE_TEXT_PADDING_PX * 2),
  );
  const height = Math.max(
    1,
    Math.ceil(fontSize * 1.35 + SCENE_TEXT_PADDING_PX * 2),
  );
  canvas.width = width;
  canvas.height = height;

  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = rgbaCss(textPrimitive.color ?? DEFAULT_SCENE_TEXT_COLOR);
  context.fillText(textPrimitive.text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return {
    aspectRatio: width / height,
    texture: texture as unknown as THREE.Texture,
  };
}
