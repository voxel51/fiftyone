import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import React from "react";
import * as THREE from "three";
import type {
  Image2dOverlayPrimitive,
  Image2dOverlayPolyline,
  Image2dViewProps,
} from "./types";

const ROOT_STYLES: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const CANVAS_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
};

const OVERLAY_STYLES: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

type PlaneLayout = {
  imageWidth: number;
  imageHeight: number;
  planeWidth: number;
  planeHeight: number;
};

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
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
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
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

function projectPlanePoint(
  x: number,
  y: number,
  camera: THREE.Camera,
  size: { width: number; height: number }
) {
  const point = new THREE.Vector3(x, y, 0).project(camera);
  return {
    x: (point.x * 0.5 + 0.5) * size.width,
    y: (-point.y * 0.5 + 0.5) * size.height,
  };
}

function TexturedImagePlane({
  objectFit,
  onPlaneLayout,
  src,
}: {
  objectFit: NonNullable<Image2dViewProps["objectFit"]>;
  onPlaneLayout: (layout: PlaneLayout) => void;
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

  React.useEffect(() => {
    onPlaneLayout({
      imageWidth: texture.image?.width ?? 1,
      imageHeight: texture.image?.height ?? 1,
      planeWidth: planeScale.width,
      planeHeight: planeScale.height,
    });
  }, [
    onPlaneLayout,
    planeScale.height,
    planeScale.width,
    texture.image?.height,
    texture.image?.width,
  ]);

  return (
    <mesh scale={[planeScale.width, planeScale.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} transparent />
    </mesh>
  );
}

function OverlaySyncProbe({
  layout,
  onRectChange,
}: {
  layout: PlaneLayout | null;
  onRectChange: (rect: OverlayRect) => void;
}) {
  const { camera, size } = useThree();
  const lastRectRef = React.useRef<OverlayRect | null>(null);

  useFrame(() => {
    if (!layout) {
      return;
    }

    const topLeft = projectPlanePoint(
      -layout.planeWidth / 2,
      layout.planeHeight / 2,
      camera,
      size
    );
    const bottomRight = projectPlanePoint(
      layout.planeWidth / 2,
      -layout.planeHeight / 2,
      camera,
      size
    );

    const nextRect = {
      left: Math.min(topLeft.x, bottomRight.x),
      top: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
      imageWidth: layout.imageWidth,
      imageHeight: layout.imageHeight,
    };

    const previousRect = lastRectRef.current;
    const didChange =
      !previousRect ||
      Math.abs(previousRect.left - nextRect.left) > 0.5 ||
      Math.abs(previousRect.top - nextRect.top) > 0.5 ||
      Math.abs(previousRect.width - nextRect.width) > 0.5 ||
      Math.abs(previousRect.height - nextRect.height) > 0.5 ||
      previousRect.imageWidth !== nextRect.imageWidth ||
      previousRect.imageHeight !== nextRect.imageHeight;

    if (didChange) {
      lastRectRef.current = nextRect;
      onRectChange(nextRect);
    }
  });

  return null;
}

function getOverlayBounds(overlays: Image2dOverlayPrimitive[]) {
  const points = overlays.flatMap((overlay) => {
    if (overlay.kind === "circle") {
      return [
        {
          x: overlay.center.x - overlay.radius,
          y: overlay.center.y - (overlay.radiusY ?? overlay.radius),
        },
        {
          x: overlay.center.x + overlay.radius,
          y: overlay.center.y + (overlay.radiusY ?? overlay.radius),
        },
      ];
    }

    if (overlay.kind === "points" || overlay.kind === "polyline") {
      return overlay.points;
    }

    return [overlay.position];
  });

  if (!points.length) {
    return {
      width: 1,
      height: 1,
    };
  }

  const maxX = Math.max(...points.map((point) => point.x), 1);
  const maxY = Math.max(...points.map((point) => point.y), 1);
  return {
    width: Math.ceil(maxX),
    height: Math.ceil(maxY),
  };
}

function renderPolyline(overlay: Image2dOverlayPolyline) {
  if (overlay.mode === "line-list") {
    const segments: React.ReactNode[] = [];

    for (let index = 0; index < overlay.points.length; index += 2) {
      const start = overlay.points[index];
      const end = overlay.points[index + 1];
      if (!start || !end) {
        continue;
      }

      segments.push(
        <line
          key={`${overlay.id}:${index}`}
          x1={start.x}
          x2={end.x}
          y1={start.y}
          y2={end.y}
          stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
          strokeWidth={overlay.strokeWidth ?? 2}
        />
      );
    }

    return segments;
  }

  const points = overlay.points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  if (overlay.closed) {
    return (
      <polygon
        fill={overlay.fillColor ?? "transparent"}
        points={points}
        stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
        strokeWidth={overlay.strokeWidth ?? 2}
      />
    );
  }

  return (
    <polyline
      fill="none"
      points={points}
      stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
      strokeWidth={overlay.strokeWidth ?? 2}
    />
  );
}

function ImageOverlaySvg({
  overlays,
  rect,
}: {
  overlays: Image2dOverlayPrimitive[];
  rect: OverlayRect | null;
}) {
  if (!overlays.length) {
    return null;
  }

  const fallbackBounds = getOverlayBounds(overlays);
  const viewWidth = rect?.imageWidth ?? fallbackBounds.width;
  const viewHeight = rect?.imageHeight ?? fallbackBounds.height;

  return (
    <svg
      data-testid="image2d-overlay"
      preserveAspectRatio="none"
      style={{
        ...OVERLAY_STYLES,
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width ?? "100%",
        height: rect?.height ?? "100%",
      }}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
    >
      {overlays.map((overlay) => {
        if (overlay.kind === "circle") {
          return (
            <ellipse
              key={overlay.id}
              cx={overlay.center.x}
              cy={overlay.center.y}
              fill={overlay.fillColor ?? "transparent"}
              rx={overlay.radius}
              ry={overlay.radiusY ?? overlay.radius}
              stroke={overlay.strokeColor ?? "rgba(255,255,255,1)"}
              strokeWidth={overlay.strokeWidth ?? 2}
            />
          );
        }

        if (overlay.kind === "points") {
          return (
            <g key={overlay.id}>
              {overlay.points.map((point, index) => (
                <circle
                  key={`${overlay.id}:${index}`}
                  cx={point.x}
                  cy={point.y}
                  fill={overlay.fillColor ?? overlay.strokeColor ?? "white"}
                  r={overlay.pointRadius ?? 3}
                  stroke={overlay.strokeColor ?? "transparent"}
                  strokeWidth={overlay.strokeWidth ?? 0}
                />
              ))}
            </g>
          );
        }

        if (overlay.kind === "polyline") {
          return <g key={overlay.id}>{renderPolyline(overlay)}</g>;
        }

        const textWidth = Math.max(
          overlay.text.length * (overlay.fontSize ?? 14) * 0.6,
          28
        );
        const textHeight = Math.max((overlay.fontSize ?? 14) * 1.35, 18);

        return (
          <g
            key={overlay.id}
            transform={`translate(${overlay.position.x}, ${overlay.position.y})`}
          >
            <rect
              fill={overlay.backgroundColor ?? "rgba(11,18,29,0.84)"}
              height={textHeight}
              rx={3}
              ry={3}
              width={textWidth}
              x={-2}
              y={-textHeight + 4}
            />
            <text
              fill={overlay.textColor ?? "rgba(255,255,255,1)"}
              fontSize={overlay.fontSize ?? 14}
              x={2}
              y={0}
            >
              {overlay.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Image2dView({
  alt = "",
  frame,
  objectFit = "contain",
}: Image2dViewProps) {
  const [planeLayout, setPlaneLayout] = React.useState<PlaneLayout | null>(
    null
  );
  const [overlayRect, setOverlayRect] = React.useState<OverlayRect | null>(
    null
  );

  React.useEffect(() => {
    setPlaneLayout(null);
    setOverlayRect(null);
  }, [frame?.id]);

  if (!frame) {
    return null;
  }

  return (
    <div
      aria-label={alt || undefined}
      data-object-fit={objectFit}
      data-src={frame.src}
      data-testid="image2d-view"
      style={ROOT_STYLES}
    >
      <Canvas
        camera={{ far: 1000, near: 0.1, position: [0, 0, 10], zoom: 100 }}
        frameloop="demand"
        gl={{ alpha: true }}
        orthographic
        style={CANVAS_STYLES}
      >
        <TexturedImageControls />
        <TexturedImagePlane
          objectFit={objectFit}
          onPlaneLayout={setPlaneLayout}
          src={frame.src}
        />
        <OverlaySyncProbe layout={planeLayout} onRectChange={setOverlayRect} />
      </Canvas>
      <ImageOverlaySvg overlays={frame.overlays ?? []} rect={overlayRect} />
    </div>
  );
}
