/* eslint-disable react/no-unknown-property */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { RgbaColor, SceneTextPrimitive } from "../../ir";
import { scenePoseObjectTransform } from "./transforms";
import type { TextSpriteTexture } from "./types";
import { clamp01, rgbaCss } from "./utils";

const DEFAULT_SCENE_TEXT_COLOR: RgbaColor = [1, 1, 1, 1];
const SCENE_TEXT_FONT_FAMILY = "Inter, system-ui, sans-serif";
const SCENE_TEXT_MIN_CANVAS_FONT_SIZE = 12;
// Screen-pixel floor for scale-invariant text. Also rescues payloads that
// set scale_invariant=true with a world-unit font_size (e.g. 0.04), which
// per the Foxglove spec would render at a fraction of a pixel.
const SCENE_TEXT_MIN_SCREEN_PX = 12;
const SCENE_TEXT_LINE_HEIGHT = 1.35;
export const SCENE_TEXT_DEFAULT_WORLD_HEIGHT = 0.5;
const SCENE_TEXT_PADDING_PX = 4;

const textWorldPosition = new THREE.Vector3();

export function SceneTextSprite({
  textPrimitive,
}: {
  readonly textPrimitive: SceneTextPrimitive;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const meshRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const spriteTexture = useMemo(
    () => createTextSpriteTexture(textPrimitive),
    [textPrimitive],
  );

  useEffect(() => {
    if (!spriteTexture) return;
    invalidate();
    return () => spriteTexture.texture.dispose();
  }, [invalidate, spriteTexture]);

  // Scale-invariant font sizes are screen pixels (Foxglove spec), so the
  // equivalent world-space height depends on camera distance, zoom, and
  // viewport size. This recomputes the object scale on every rendered frame.
  useFrame(({ camera, size }) => {
    const object = meshRef.current ?? spriteRef.current;
    if (!object || !spriteTexture || !textPrimitive.scaleInvariant) {
      return;
    }

    const fontPx = Math.max(
      SCENE_TEXT_MIN_SCREEN_PX,
      textPrimitive.fontSize || 0,
    );
    const spritePx = fontPx * spriteTexture.heightPerFontUnit;

    // Casts, not types: fiber's bundled three camera types are out of sync
    // with the app's pinned three version — same workaround as textureMap.
    const perspective = camera as unknown as THREE.PerspectiveCamera;
    let viewportWorldHeight: number;
    if (perspective.isPerspectiveCamera) {
      const distance = object
        .getWorldPosition(textWorldPosition)
        .distanceTo(perspective.position);
      viewportWorldHeight =
        (2 *
          distance *
          Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) /
        perspective.zoom;
    } else {
      const orthographic = camera as unknown as THREE.OrthographicCamera;
      viewportWorldHeight =
        (orthographic.top - orthographic.bottom) / orthographic.zoom;
    }

    const worldHeight = (spritePx / size.height) * viewportWorldHeight;
    object.scale.set(worldHeight * spriteTexture.aspectRatio, worldHeight, 1);
  });

  if (!spriteTexture) {
    return null;
  }

  const transform = scenePoseObjectTransform(textPrimitive.pose);
  const [, , , alpha] = textPrimitive.color ?? DEFAULT_SCENE_TEXT_COLOR;
  // Cast, not a type: fiber's bundled three `Texture` type is out of sync
  // with the app's pinned three version — see GridSceneLayer's textureMap.
  const textureMap = spriteTexture.texture as never;

  // Without scale_invariant, font_size is a world-space height (meters);
  // scale-invariant sizing is applied per frame above and this value is
  // overwritten before the first draw.
  const fontWorldHeight =
    textPrimitive.fontSize > 0
      ? textPrimitive.fontSize
      : SCENE_TEXT_DEFAULT_WORLD_HEIGHT;
  const worldHeight = fontWorldHeight * spriteTexture.heightPerFontUnit;
  const scale: [number, number, number] = [
    worldHeight * spriteTexture.aspectRatio,
    worldHeight,
    1,
  ];

  if (!textPrimitive.billboard) {
    return (
      <group position={transform.position} quaternion={transform.quaternion}>
        <mesh frustumCulled={false} ref={meshRef as never} scale={scale}>
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
      <sprite frustumCulled={false} ref={spriteRef as never} scale={scale}>
        <spriteMaterial map={textureMap} opacity={clamp01(alpha)} transparent />
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

  // Rasterize at device resolution so scale-invariant text stays crisp on
  // hidpi displays; display size is controlled by the object scale, not the
  // canvas resolution.
  const rasterScale = window.devicePixelRatio || 1;
  const fontSize =
    Math.max(
      SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
      textPrimitive.fontSize || SCENE_TEXT_MIN_CANVAS_FONT_SIZE,
    ) * rasterScale;
  const padding = SCENE_TEXT_PADDING_PX * rasterScale;
  const font = `${fontSize}px ${SCENE_TEXT_FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(textPrimitive.text);
  const width = Math.max(1, Math.ceil(metrics.width + padding * 2));
  const height = Math.max(
    1,
    Math.ceil(fontSize * SCENE_TEXT_LINE_HEIGHT + padding * 2),
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
    heightPerFontUnit: height / fontSize,
    texture: texture as unknown as THREE.Texture,
  };
}
