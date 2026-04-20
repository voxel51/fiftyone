import { OrbitControls } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";

/** Visual props for a Three.js-backed textured image surface. */
export type TexturedImageViewProps = {
  src: string;
  alt?: string;
  objectFit?: "contain" | "cover";
  testId?: string;
};

const ROOT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const CANVAS_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

function TexturedImageControls() {
  return (
    <OrbitControls
      dampingFactor={0.08}
      enablePan
      enableRotate={false}
      enableZoom
      enableDamping
      makeDefault
      maxZoom={800}
      minZoom={20}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      panSpeed={0.9}
      screenSpacePanning
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      zoomSpeed={0.9}
    />
  );
}

function getPlaneScale({
  imageWidth,
  imageHeight,
  viewportWidth,
  viewportHeight,
  objectFit,
}: {
  imageWidth: number;
  imageHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  objectFit: NonNullable<TexturedImageViewProps["objectFit"]>;
}) {
  const safeImageWidth = imageWidth || 1;
  const safeImageHeight = imageHeight || 1;
  const safeViewportWidth = viewportWidth || 1;
  const safeViewportHeight = viewportHeight || 1;
  const imageAspect = safeImageWidth / safeImageHeight;
  const viewportAspect = safeViewportWidth / safeViewportHeight;

  if (objectFit === "cover") {
    if (imageAspect > viewportAspect) {
      return {
        width: safeViewportHeight * imageAspect,
        height: safeViewportHeight,
      };
    }

    return {
      width: safeViewportWidth,
      height: safeViewportWidth / imageAspect,
    };
  }

  if (imageAspect > viewportAspect) {
    return {
      width: safeViewportWidth,
      height: safeViewportWidth / imageAspect,
    };
  }

  return {
    width: safeViewportHeight * imageAspect,
    height: safeViewportHeight,
  };
}

function TexturedImagePlane({
  objectFit,
  src,
}: {
  objectFit: NonNullable<TexturedImageViewProps["objectFit"]>;
  src: string;
}) {
  const texture = useLoader(THREE.TextureLoader, src);
  const { invalidate, viewport } = useThree();

  React.useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    invalidate();
  }, [invalidate, texture]);

  const planeScale = React.useMemo(() => {
    return getPlaneScale({
      imageWidth: texture.image?.width ?? 1,
      imageHeight: texture.image?.height ?? 1,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      objectFit,
    });
  }, [
    objectFit,
    texture.image?.height,
    texture.image?.width,
    viewport.height,
    viewport.width,
  ]);

  return (
    <mesh scale={[planeScale.width, planeScale.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} transparent />
    </mesh>
  );
}

/** Three.js-backed textured image surface for multimodal panels. */
export function TexturedImageView({
  alt = "",
  objectFit = "contain",
  src,
  testId = "textured-image-view",
}: TexturedImageViewProps) {
  return (
    <div aria-label={alt || undefined} data-testid={testId} style={ROOT_STYLES}>
      <Canvas
        camera={{ far: 1000, near: 0.1, position: [0, 0, 10], zoom: 100 }}
        frameloop="demand"
        gl={{ alpha: true }}
        orthographic
        style={CANVAS_STYLES}
      >
        <TexturedImageControls />
        <TexturedImagePlane objectFit={objectFit} src={src} />
      </Canvas>
    </div>
  );
}
